"""Sequential invoice numbering (`INV-<year>-<seq>`, per org per year) —
deliberately separate from common/codegen.py's `generate_unique_code`, which
derives a code by slugifying a name (fits Course/Group, not a monotonic
invoice sequence). Locks the org's existing rows for the year with
`select_for_update` inside the caller's transaction so two concurrent
invoice creations for the same org can't race onto the same number.
"""

from django.db import transaction
from django.utils import timezone


def generate_invoice_number(model_cls, organization) -> str:
    year = timezone.localdate().year
    prefix = f"INV-{year}-"
    manager = model_cls.all_objects if hasattr(model_cls, "all_objects") else model_cls.objects

    with transaction.atomic():
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
