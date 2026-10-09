import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple"
  | "secondary";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  info: "bg-blue-50 text-blue-700",
  purple: "bg-violet-50 text-violet-700",
  secondary: "bg-slate-100 text-slate-500",
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

export function Badge({ label, variant = "default", className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", {
            "bg-slate-500": variant === "default",
            "bg-emerald-500": variant === "success",
            "bg-amber-500": variant === "warning",
            "bg-red-500": variant === "danger",
            "bg-blue-500": variant === "info",
            "bg-violet-500": variant === "purple",
            "bg-slate-400": variant === "secondary",
          })}
        />
      )}
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    active: { label: "Active", variant: "success" },
    inactive: { label: "Inactive", variant: "secondary" },
    pending: { label: "Pending", variant: "warning" },
    suspended: { label: "Suspended", variant: "danger" },
    on_leave: { label: "On Leave", variant: "warning" },
    terminated: { label: "Terminated", variant: "danger" },
    graduated: { label: "Graduated", variant: "info" },
    expelled: { label: "Expelled", variant: "danger" },
    transferred: { label: "Transferred", variant: "secondary" },
    paid: { label: "Paid", variant: "success" },
    partially_paid: { label: "Partially Paid", variant: "warning" },
    draft: { label: "Draft", variant: "secondary" },
    refunded: { label: "Refunded", variant: "purple" },
    overdue: { label: "Overdue", variant: "danger" },
    cancelled: { label: "Cancelled", variant: "secondary" },
    approved: { label: "Approved", variant: "success" },
    rejected: { label: "Rejected", variant: "danger" },
    scheduled: { label: "Scheduled", variant: "info" },
    completed: { label: "Completed", variant: "success" },
    present: { label: "Present", variant: "success" },
    absent: { label: "Absent", variant: "danger" },
    late: { label: "Late", variant: "warning" },
    excused: { label: "Excused", variant: "info" },
    beginner: { label: "Beginner", variant: "success" },
    intermediate: { label: "Intermediate", variant: "warning" },
    advanced: { label: "Advanced", variant: "danger" },
  };

  const config = map[status] ?? { label: status, variant: "default" as BadgeVariant };
  return <Badge label={config.label} variant={config.variant} dot />;
}
