"""Click Merchant API — the two-step Prepare/Complete callback Click's
servers make on our webhook endpoint once a user has confirmed payment on
the redirect link built by services/checkout.py. `sign_string` verification
follows Click's documented MD5 formula; error codes below are Click's fixed
protocol codes (not merchant-definable, unlike Payme's -31050..-31099
range) — see payment_gateways/services/payme.py's docstring for the same
"not byte-exact certification parity" caveat.
"""

from __future__ import annotations

import hashlib
import hmac
from decimal import Decimal

from django.db import transaction as db_transaction
from django.utils import timezone

from finance.models import Invoice, Payment
from finance.services import invoice_balance, recompute_invoice_status
from payment_gateways.models import GatewayTransaction

ERR_SIGN_FAILED = -1
ERR_INVALID_AMOUNT = -2
ERR_ALREADY_PAID = -4
ERR_ORDER_NOT_FOUND = -5
ERR_TRANSACTION_NOT_FOUND = -6
ERR_TRANSACTION_CANCELLED = -9


class ClickError(Exception):
    def __init__(self, code: int, note: str):
        self.code = code
        self.note = note
        super().__init__(note)


def _require(params: dict, key: str):
    """Click's signature check authenticates the request independent of
    which fields are present — a missing/malformed field must still get
    back Click's own error shape, not an uncaught KeyError/TypeError."""
    value = params.get(key)
    if value is None:
        raise ClickError(ERR_ORDER_NOT_FOUND, f"Missing required field: {key}.")
    return value


def _md5(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()


def verify_signature(secret_key: str, params: dict) -> bool:
    action = str(params.get("action", ""))
    parts = [
        str(params.get("click_trans_id", "")),
        str(params.get("service_id", "")),
        secret_key,
        str(params.get("merchant_trans_id", "")),
    ]
    if action == "1":
        parts.append(str(params.get("merchant_prepare_id", "")))
    parts += [str(params.get("amount", "")), action, str(params.get("sign_time", ""))]
    expected = _md5("".join(parts))
    # Constant-time: a plain == leaks, through response timing, how many
    # leading characters of a forged signature were right.
    return hmac.compare_digest(expected, str(params.get("sign_string", "")))


def _find_transaction(gateway_account, merchant_trans_id: str) -> GatewayTransaction:
    txn = GatewayTransaction.objects.filter(
        organization_id=gateway_account.organization_id, provider="click", merchant_trans_id=merchant_trans_id
    ).first()
    if txn is None:
        raise ClickError(ERR_ORDER_NOT_FOUND, "Order not found.")
    return txn


def prepare(gateway_account, params: dict) -> dict:
    click_trans_id = str(_require(params, "click_trans_id"))
    merchant_trans_id = str(_require(params, "merchant_trans_id"))
    amount = Decimal(str(_require(params, "amount")))

    txn = _find_transaction(gateway_account, merchant_trans_id)

    if txn.status == "success":
        raise ClickError(ERR_ALREADY_PAID, "Order has already been paid.")
    if txn.status == "cancelled":
        raise ClickError(ERR_TRANSACTION_CANCELLED, "Order was cancelled.")
    if amount != txn.amount:
        raise ClickError(ERR_INVALID_AMOUNT, "Amount does not match the invoice balance.")

    txn.provider_transaction_id = click_trans_id
    txn.status = "pending"
    txn.raw_payload = params
    txn.save(update_fields=["provider_transaction_id", "status", "raw_payload", "updated_at"])

    return {
        "click_trans_id": click_trans_id,
        "merchant_trans_id": merchant_trans_id,
        "merchant_prepare_id": str(txn.id),
        "error": 0,
        "error_note": "Success",
    }


def complete(gateway_account, params: dict) -> dict:
    click_trans_id = str(_require(params, "click_trans_id"))
    merchant_trans_id = str(_require(params, "merchant_trans_id"))
    merchant_prepare_id = str(params.get("merchant_prepare_id", ""))
    amount = Decimal(str(_require(params, "amount")))
    incoming_error = int(params.get("error", 0))

    txn = _find_transaction(gateway_account, merchant_trans_id)

    if str(txn.id) != merchant_prepare_id:
        raise ClickError(ERR_TRANSACTION_NOT_FOUND, "merchant_prepare_id does not match a prepared transaction.")

    if txn.status == "success":
        # Idempotent replay: Complete called again for an already-settled
        # transaction — echo the same success, don't credit twice.
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": str(txn.id),
            "error": 0,
            "error_note": "Success",
        }
    if txn.status == "cancelled":
        raise ClickError(ERR_TRANSACTION_CANCELLED, "Transaction was cancelled.")

    if incoming_error < 0:
        # Payment failed/was cancelled on Click's own side — nothing to
        # credit; just record what Click told us.
        txn.status = "failed"
        txn.error_code = str(incoming_error)
        txn.error_note = params.get("error_note")
        txn.save(update_fields=["status", "error_code", "error_note", "updated_at"])
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": str(txn.id),
            "error": incoming_error,
            "error_note": params.get("error_note") or "Failed",
        }

    if amount != txn.amount:
        raise ClickError(ERR_INVALID_AMOUNT, "Amount does not match the invoice balance.")

    with db_transaction.atomic():
        # Same cross-provider race payme.py's perform_transaction guards
        # against: a student can leave two checkout links pending on the
        # same invoice, so re-check the balance under lock right before
        # crediting rather than trusting txn.amount alone.
        invoice = Invoice.objects.select_for_update().get(pk=txn.invoice_id)
        if invoice_balance(invoice) < txn.amount:
            raise ClickError(ERR_ALREADY_PAID, "This invoice has already been paid in full.")

        payment = Payment.objects.create(
            organization=txn.organization,
            invoice=invoice,
            student_profile=txn.student_profile,
            amount=txn.amount,
            currency=txn.currency,
            payment_method="click",
        )
        recompute_invoice_status(invoice)

        txn.status = "success"
        txn.payment = payment
        txn.performed_at = timezone.now()
        txn.save(update_fields=["status", "payment", "performed_at", "updated_at"])

    return {
        "click_trans_id": click_trans_id,
        "merchant_trans_id": merchant_trans_id,
        "merchant_confirm_id": str(txn.id),
        "error": 0,
        "error_note": "Success",
    }
