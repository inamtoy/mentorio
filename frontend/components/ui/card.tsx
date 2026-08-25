import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  noPadding?: boolean;
}

export function Card({ children, className, title, subtitle, actions, noPadding }: CardProps) {
  // Token-based (bg-card/border-border/etc., not hardcoded bg-white/slate-*)
  // so this — the single most-reused surface in the app — actually flips
  // for Super-Admin Settings' Theme > Dark Mode toggle. Deliberately not
  // every other page's own colors, which still hardcode their own
  // Tailwind literals — see app/globals.css's dark-palette comment.
  return (
    <div className={cn("bg-card rounded-2xl shadow-sm border border-border", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div>
            {title && <h3 className="text-base font-semibold text-card-foreground">{title}</h3>}
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!noPadding && "p-6")}>{children}</div>
    </div>
  );
}
