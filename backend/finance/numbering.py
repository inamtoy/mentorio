"""Sequential invoice numbering (`INV-<year>-<seq>`, per org per year) —
deliberately separate from common/codegen.py's `generate_unique_code`, which
derives a code by slugifying a name (fits Course/Group, not a monotonic
invoice sequence). Locks the org's existing rows for the year with
`select_for_update` inside the caller's transaction so two concurrent
invoice creations for the same org can't race onto the same number.
"""

from django.db import DEFAULT_DB_ALIAS, transaction
from django.utils import timezone


def generate_invoice_number(model_cls, organization, *, using: str = DEFAULT_DB_ALIAS) -> str:
    """`organization` may be an Organization or its id. Pass `using` from
    code running outside a request's org context (management commands use
    the RLS-bypassing alias) — on the default alias RLS would hide the org's
    existing invoices and the sequence would restart at 0001."""
    year = timezone.localdate().year
    prefix = f"INV-{year}-"
    manager = (model_cls.all_objects if hasattr(model_cls, "all_objects") else model_cls.objects).db_manager(using)

    with transaction.atomic(using=using):
        last = (
            manager.select_for_update()
            .filter(organization=organization, invoice_number__startswith=prefix)
            .order_by("-invoice_number")
            .first()
        )
        next_seq = 1
        if last is not None:
            try:
                next_seq = int(last.invoice_number.rsplit("-", 1)[-1]) + 1
            except ValueError:
                next_seq = manager.filter(organization=organization, invoice_number__startswith=prefix).count() + 1
        return f"{prefix}{next_seq:04d}"
