from django.db.models import Max
from rest_framework import viewsets

from billing.filters import PlatformInvoiceFilter, PlatformPaymentFilter, SubscriptionPlanFilter
from billing.models import PlatformInvoice, PlatformPayment, SubscriptionPlan
from billing.serializers import PlatformInvoiceSerializer, PlatformPaymentSerializer, SubscriptionPlanSerializer
from billing.services import recompute_platform_invoice_status
from common.audit import audited
from common.permissions import HasModulePermission
from foundation.views import SoftDeleteDestroyMixin

BILLING_PERMISSION_MAP = {
    "list": ("billing", "view"),
    "retrieve": ("billing", "view"),
    "create": ("billing", "create"),
    "update": ("billing", "update"),
    "partial_update": ("billing", "update"),
    "destroy": ("billing", "delete"),
}

# Deliberately a *different* module from BILLING_PERMISSION_MAP above —
# `billing` (SubscriptionPlan) is a public catalog every org can eventually
# be granted read access to (see SubscriptionPlanViewSet's own docstring);
# `platform_billing` (PlatformInvoice/PlatformPayment) is Mentorio's own
# sensitive, cross-organization ledger. Sharing one module would mean a
# future `billing:view` grant for center_admins (so they can see plan
# pricing) also hands them write access to platform invoices/payments —
# a real least-privilege violation, not just a naming nicety.
PLATFORM_BILLING_PERMISSION_MAP = {
    "list": ("platform_billing", "view"),
    "retrieve": ("platform_billing", "view"),
    "create": ("platform_billing", "create"),
    "update": ("platform_billing", "update"),
    "partial_update": ("platform_billing", "update"),
    "destroy": ("platform_billing", "delete"),
}


class SubscriptionPlanViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    """Platform-wide catalog — no queryset scoping needed (unlike every
    tenant-data ViewSet in this codebase): `SubscriptionPlan` has no
    `organization` column and isn't RLS-covered, it's reference data every
    org can see. Read access isn't actually restricted to super_admin
    (`billing:view` isn't granted to any org role in
    `DEFAULT_ROLE_PERMISSIONS`, so a plain center_admin/teacher/student
    caller 403s the same as any other ungranted module) — write access is
    effectively super_admin-only for the same reason: no org role is ever
    granted `billing:create/update/delete`, and only a system-level role
    (super_admin) bypasses the grant requirement entirely (see
    `common.permissions.user_has_permission`'s platform-role bypass).
    """

    queryset = SubscriptionPlan.objects.all().order_by("display_order", "price")
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [HasModulePermission]
    filterset_class = SubscriptionPlanFilter
    search_fields = ["name", "slug"]
    entity_type = "subscription_plan"
    permission_map = BILLING_PERMISSION_MAP

    def perform_create(self, serializer):
        # The Subscriptions page's "Create Plan" form has no display_order
        # field — without a default here, every plan it creates lands at 0
        # and sorts intermixed with (or ahead of) existing tiers via
        # Meta.ordering = ["display_order", "price"]. Append after the
        # current highest instead, so a new plan shows up last by default;
        # an explicit display_order in the request (e.g. a future reorder
        # UI) still wins over this.
        if "display_order" not in serializer.validated_data:
            highest = SubscriptionPlan.objects.aggregate(Max("display_order"))["display_order__max"] or 0
            serializer.save(display_order=highest + 1)
        else:
            serializer.save()

    @audited(action="create", entity_type="subscription_plan")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="update", entity_type="subscription_plan")
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @audited(action="delete", entity_type="subscription_plan")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class PlatformInvoiceViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    """Mentorio's bill to an organization — RLS-covered (has `organization`),
    but no extra Python-level scoping needed: only super_admin ever holds
    `billing` permissions, and `is_platform_user()`'s RLS bypass already
    lets that role see every organization's rows, same as every other
    platform-wide ViewSet in this app (Centers, platform Audit Logs, ...).
    """

    queryset = PlatformInvoice.objects.all().select_related("organization", "subscription_plan").order_by("-created_at")
    serializer_class = PlatformInvoiceSerializer
    permission_classes = [HasModulePermission]
    filterset_class = PlatformInvoiceFilter
    search_fields = ["invoice_number", "organization__name", "subscription_plan__name"]
    entity_type = "platform_invoice"
    permission_map = PLATFORM_BILLING_PERMISSION_MAP

    @audited(action="create", entity_type="platform_invoice")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="platform_invoice")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class PlatformPaymentViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = PlatformPayment.objects.all().select_related("organization", "platform_invoice").order_by("-created_at")
    serializer_class = PlatformPaymentSerializer
    permission_classes = [HasModulePermission]
    filterset_class = PlatformPaymentFilter
    entity_type = "platform_payment"
    permission_map = PLATFORM_BILLING_PERMISSION_MAP

    def perform_create(self, serializer):
        payment = serializer.save()
        recompute_platform_invoice_status(payment.platform_invoice)

    def perform_update(self, serializer):
        # An edited amount (or a reassigned platform_invoice) changes what
        # the parent invoice's status/balance should read — without this,
        # only create()/destroy() ever recomputed it, so an edit would
        # silently desync the invoice from its actual payments.
        previous_invoice = serializer.instance.platform_invoice
        payment = serializer.save()
        recompute_platform_invoice_status(payment.platform_invoice)
        if payment.platform_invoice_id != previous_invoice.id:
            recompute_platform_invoice_status(previous_invoice)

    # CLAUDE.md mandates payment events specifically in the audit trail
    # (common/audit.py's docstring: "auth, payment, role-change, deletion").
    @audited(action="create", entity_type="platform_payment")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="update", entity_type="platform_payment")
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @audited(action="delete", entity_type="platform_payment")
    def destroy(self, request, *args, **kwargs):
        # SoftDeleteDestroyMixin.destroy() soft-deletes directly (never
        # calls perform_destroy()), so the invoice's status is recomputed
        # here rather than in a perform_destroy() override that would
        # never run — same gotcha finance.PaymentViewSet.destroy() already
        # documents.
        instance = self.get_object()
        invoice = instance.platform_invoice
        response = super().destroy(request, *args, **kwargs)
        recompute_platform_invoice_status(invoice)
        return response
