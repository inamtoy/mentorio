import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  // Token-based (--primary, set by Super-Admin Settings' Theme >
  // primaryColor via theme-applier.tsx) — every other variant keeps its
  // fixed color, only the platform's actual brand color is configurable.
  primary: "bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm",
  secondary: "bg-slate-100 hover:bg-slate-200 text-slate-700",
  ghost: "hover:bg-slate-100 text-slate-600",
  danger: "bg-red-500 hover:bg-red-600 text-white",
  outline: "border border-slate-200 hover:bg-slate-50 text-slate-700",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-base gap-2",
  icon: "h-9 w-9",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  children,
  loading,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
      ) : (
        children
      )}
    </button>
  );
}
