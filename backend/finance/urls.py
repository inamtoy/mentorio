from rest_framework.routers import DefaultRouter

from finance.views import ExpenseViewSet, InvoiceViewSet, PayrollViewSet, PaymentViewSet

router = DefaultRouter()
router.register("finance/payments", PaymentViewSet, basename="payment")
router.register("finance/invoices", InvoiceViewSet, basename="invoice")
router.register("finance/expenses", ExpenseViewSet, basename="expense")
router.register("finance/payroll", PayrollViewSet, basename="payroll")

urlpatterns = router.urls
