"""Server-generated, org-unique short codes for entities whose frontend form
never collects one (Course, Group — unlike Student/Teacher, which collect
student_code/teacher_code directly from the admin). Mirrors the spirit of
foundation's login_id DB sequence, but per-organization and derived from a
name rather than a global counter, so it needs an app-side retry loop
instead of a DB sequence.
"""

import re

from django.db.models import BigIntegerField, Max
from django.db.models.functions import Cast, Substr
from django.utils.text import slugify


def generate_unique_code(model_cls, organization, name: str, *, code_field: str = "code", max_length: int = 50) -> str:
    """Checks against `model_cls.all_objects` (not the soft-delete-scoped
    default manager) — the (organization, code) unique constraint isn't
    partial on deleted_at, so a soft-deleted row still occupies its code,
    the same gotcha already documented for student_code/teacher_code.
    """

    base = slugify(name).upper()[: max_length - 4] or "ITEM"
    manager = model_cls.all_objects if hasattr(model_cls, "all_objects") else model_cls.objects

    candidate = base
    suffix = 1
    while manager.filter(organization=organization, **{code_field: candidate}).exists():
        suffix += 1
        candidate = f"{base}-{suffix}"[:max_length]
    return candidate


def generate_sequential_code(model_cls, organization, *, prefix: str, code_field: str = "code", width: int = 4) -> str:
    """The next "<prefix><n>" in the org (e.g. "STU-0001"), for a code the
    form makes optional. Only codes of exactly that shape count toward n, so
    hand-typed codes ("EDU", "STU-TEST-001") can't break the sequence; the
    max is numeric, not lexicographic, so "STU-10000" follows "STU-9999".
    Soft-deleted rows count too (same unique-constraint gotcha as above).
    Two simultaneous creates can still collide on the unique constraint —
    acceptable for a hand-driven admin form, unlike invoice numbering.
    """
    manager = model_cls.all_objects if hasattr(model_cls, "all_objects") else model_cls.objects
    last = manager.filter(
        organization=organization, **{f"{code_field}__regex": rf"^{re.escape(prefix)}[0-9]+$"}
    ).aggregate(n=Max(Cast(Substr(code_field, len(prefix) + 1), BigIntegerField())))["n"]
    return f"{prefix}{(last or 0) + 1:0{width}d}"
