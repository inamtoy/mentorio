import base64
import hmac
import logging

from django.db import transaction as db_transaction
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import audit_log, audited
from common.context import apply_org_context
from common.permissions import HasModulePermission, user_has_permission
from finance.models import Invoice
from foundation.views import SoftDeleteDestroyMixin
from payment_gateways.filters import PaymentGatewayAccountFilter
from payment_gateways.models import PaymentGatewayAccount
from payment_gateways.serializers import PaymentGatewayAccountSerializer
from payment_gateways.services import click, payme
from payment_gateways.services.checkout import build_checkout_url

logger = logging.getLogger(__name__)

BYPASS_ALIAS = "auth_bypass_rls"  # see auth_custom/services/session_service.py — same role, same reason:
# lookups that must happen before any org context (and thus RLS) exists.

GATEWAY_PERMISSION_MAP = {
    "list": ("payment_gateways", "view"),
    "retrieve": ("payment_gateways", "view"),
    "create": ("payment_gateways", "create"),
    "update": ("payment_gateways", "update"),
    "partial_update": ("payment_gateways", "update"),
    "destroy": ("payment_gateways", "delete"),
}


class PaymentGatewayAccountViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = PaymentGatewayAccount.objects.all().order_by("provider")
    serializer_class = PaymentGatewayAccountSerializer
    permission_classes = [HasModulePermission]
    filterset_class = PaymentGatewayAccountFilter
    entity_type = "payment_gateway_account"
    permission_map = GATEWAY_PERMISSION_MAP

    # A center's merchant credentials are a security-sensitive surface
    # (CLAUDE.md: "sensitive actions must be logged") — same "create and
    # delete only" precedent as finance.views.InvoiceViewSet.
    @audited(action="create", entity_type="payment_gateway_account")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="payment_gateway_account")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class CheckoutInitiateView(APIView):
    """POST {invoice, provider, return_url?} -> {checkout_url, merchant_trans_id}.

    Two distinct callers, two distinct permission checks (deliberately NOT
    the coarse `HasModulePermission`/`finance:create` gate — that's a
    module-wide grant, only ever held by center_admin, and would be wrong
    for the second case): a center_admin paying down any invoice in their
    org from the Finance UI, or a student paying their own invoice from the
    Student portal's "Pay" flow — same `_check_owns_group`-style ownership
    check as e.g. homework.views.AssignmentViewSet, not a permission grant.
    RLS already keeps the `Invoice.objects.filter(pk=...)` lookup below
    inside the caller's own organization; the explicit `student_profile_id`
    check on top of that is what stops a student from acting on a
    *different* student's invoice in the same org (RLS has no concept of
    "same org, different student").
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        invoice_id = request.data.get("invoice")
        provider = request.data.get("provider")
        if provider not in ("payme", "click"):
            raise ValidationError({"provider": "Must be 'payme' or 'click'."})

        invoice = Invoice.objects.filter(pk=invoice_id).first()
        if invoice is None:
            raise ValidationError({"invoice": "Invoice not found."})

        student_profile = getattr(request.user, "student_profile", None)
        is_own_invoice = student_profile is not None and invoice.student_profile_id == student_profile.id
        if not is_own_invoice and not user_has_permission(request.user, "finance", "create"):
            raise PermissionDenied("You can only pay your own invoice.")

        transaction, checkout_url = build_checkout_url(
            invoice,
            provider,
            return_url=request.data.get("return_url"),
            created_by=request.user.id if request.user.is_authenticated else None,
        )
        audit_log(
            request,
            action="checkout_initiated",
            entity_type="gateway_transaction",
            entity_id=str(transaction.id),
            metadata={"provider": provider, "invoice": str(invoice.id)},
        )
        return Response(
            {"checkout_url": checkout_url, "merchant_trans_id": transaction.merchant_trans_id, "gateway_transaction_id": str(transaction.id)}
        )


def _lookup_gateway_account(gateway_account_id: str, provider: str) -> PaymentGatewayAccount | None:
    """Looked up via the BYPASSRLS alias — at this point in a webhook
    request no org context exists yet (see common/context.py::apply_org_context's
    docstring), so a normal query would see nothing.
    """
    return (
        PaymentGatewayAccount.objects.using(BYPASS_ALIAS)
        .filter(id=gateway_account_id, provider=provider, is_active=True)
        .first()
    )


class PaymeWebhookView(APIView):
    """No JWT, no session — Payme's servers call this directly, authenticated
    only by HTTP Basic (login always "Paycom", password = this gateway
    account's secret_key). Response body is Payme's own JSON-RPC shape, never
    the {success,message,data} envelope every other endpoint returns — see
    `renderer_classes` below.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer]

    def post(self, request, gateway_account_id):
        rpc_id = request.data.get("id")
        method = request.data.get("method")
        params = request.data.get("params") or {}

        gateway_account = self._authenticate(request, gateway_account_id)
        if gateway_account is None:
            return self._error(rpc_id, payme.ERR_AUTH, "Insufficient privileges.")

        handler = payme.METHODS.get(method)
        if handler is None:
            return self._error(rpc_id, payme.ERR_METHOD_NOT_FOUND, "Method not found.")

        try:
            with db_transaction.atomic():
                apply_org_context(str(gateway_account.organization_id))
                result = handler(gateway_account, params)
        except payme.PaymeError as exc:
            audit_log(
                request, user=None, using=BYPASS_ALIAS,
                action="payment_failed", entity_type="gateway_transaction",
                metadata={"provider": "payme", "method": method, "error": exc.message},
            )
            return self._error(rpc_id, exc.code, exc.message)
        except Exception:
            # Any handler bug (or a malformed request our own validation
            # missed) must still get back Payme's JSON-RPC error shape, not
            # a raw Django 500 — Payme's integration only parses this shape.
            logger.exception("Unhandled error in Payme webhook (method=%s)", method)
            return self._error(rpc_id, payme.ERR_INVALID_REQUEST, "Internal error processing request.")

        if method == "PerformTransaction":
            audit_log(
                request, user=None, using=BYPASS_ALIAS,
                action="payment_success", entity_type="gateway_transaction",
                entity_id=result.get("transaction"), metadata={"provider": "payme"},
            )
        return Response({"result": result, "id": rpc_id})

    def _authenticate(self, request, gateway_account_id):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth_header.startswith("Basic "):
            return None
        try:
            decoded = base64.b64decode(auth_header.removeprefix("Basic ").strip()).decode()
            login, _, password = decoded.partition(":")
        except (ValueError, UnicodeDecodeError):
            return None

        gateway_account = _lookup_gateway_account(gateway_account_id, "payme")
        if gateway_account is None or login != "Paycom" or not hmac.compare_digest(password, gateway_account.secret_key or ""):
            return None
        return gateway_account

    @staticmethod
    def _error(rpc_id, code: int, message: str) -> Response:
        return Response({"error": {"code": code, "message": payme.to_multilang_message(message)}, "id": rpc_id})


class ClickWebhookView(APIView):
    """No JWT, no session — Click's servers call this directly, authenticated
    by `sign_string` (MD5 of the request's own fields + our shared secret,
    see services/click.py::verify_signature). Response body is Click's own
    REST shape, never the {success,message,data} envelope.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    renderer_classes = [JSONRenderer]

    def post(self, request, gateway_account_id):
        params = request.data
        gateway_account = _lookup_gateway_account(gateway_account_id, "click")
        if gateway_account is None or not click.verify_signature(gateway_account.secret_key, params):
            return self._error(params, click.ERR_SIGN_FAILED, "SIGN CHECK FAILED!")

        action = str(params.get("action"))
        handler = click.prepare if action == "0" else click.complete if action == "1" else None
        if handler is None:
            return self._error(params, -3, "Action not found.")

        try:
            with db_transaction.atomic():
                apply_org_context(str(gateway_account.organization_id))
                result = handler(gateway_account, params)
        except click.ClickError as exc:
            audit_log(
                request, user=None, using=BYPASS_ALIAS,
                action="payment_failed", entity_type="gateway_transaction",
                metadata={"provider": "click", "action": action, "error": exc.note},
            )
            return self._error(params, exc.code, exc.note)
        except Exception:
            logger.exception("Unhandled error in Click webhook (action=%s)", action)
            return self._error(params, -8, "Internal error processing request.")

        if action == "1":
            # Click reports a failed/cancelled payment as a normal (non-error
            # HTTP) response with a negative `error` field, not an exception —
            # still a payment event CLAUDE.md requires logging either way.
            success = result.get("error") == 0
            audit_log(
                request, user=None, using=BYPASS_ALIAS,
                action="payment_success" if success else "payment_failed", entity_type="gateway_transaction",
                entity_id=result.get("merchant_confirm_id"),
                metadata={"provider": "click", "error": result.get("error"), "error_note": result.get("error_note")},
            )
        return Response(result)

    @staticmethod
    def _error(params: dict, code: int, note: str) -> Response:
        return Response(
            {
                "click_trans_id": params.get("click_trans_id"),
                "merchant_trans_id": params.get("merchant_trans_id"),
                "error": code,
                "error_note": note,
            }
        )
