import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  // Token-based, not hardcoded text-slate-900/500 — this is every page's
  // top-of-page title (used identically everywhere, same "shared shell"
  // status as Card/Button/Sidebar/Header), and slate-900 on the dark
  // palette's near-identical --background was rendering literally
  // invisible (near-black on near-black) until this fix.
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}
