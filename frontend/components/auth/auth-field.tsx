import { cn } from "@/lib/utils";

/** Input chrome shared by every signed-out screen (login, forgot password,
 * forced password change) so they read as one flow. */
export function FieldShell({ icon, error, children }: { icon: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <>
      <div
        className={cn(
          "group relative flex h-[53px] items-center rounded-[11px] border bg-white shadow-[0_1px_2px_rgba(20,24,50,0.024)] transition-[border-color,box-shadow] duration-150",
          error
            ? "border-red-300 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]"
            : "border-[#e0e1ea] focus-within:border-[#6960df] focus-within:shadow-[0_0_0_3px_rgba(100,89,220,0.1)]",
        )}
      >
        <span className="grid w-[47px] flex-none place-items-center text-[#9b9cac] group-focus-within:text-[#5d51d5]">{icon}</span>
        {children}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </>
  );
}

export const AUTH_INPUT_CLASS =
  "h-full min-w-0 flex-1 border-0 bg-transparent pr-3 text-sm text-[#222433] outline-none placeholder:text-[#a4a5b2] disabled:opacity-60";

export const AUTH_ICON_CLASS = "h-[19px] w-[19px]";

export const AUTH_LABEL_CLASS = "mb-[9px] block text-[13px] font-semibold text-[#333545]";

export const AUTH_PRIMARY_BUTTON_CLASS =
  "flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[11px] bg-[linear-gradient(100deg,#642ee8_0%,#3f5cf1_100%)] px-5 text-sm font-semibold text-white shadow-[0_2px_4px_rgba(49,40,145,0.15),0_10px_24px_rgba(79,63,219,0.21)] transition-[transform,box-shadow,filter] duration-150 hover:enabled:-translate-y-px hover:enabled:saturate-[1.08] hover:enabled:shadow-[0_2px_5px_rgba(49,40,145,0.18),0_13px_28px_rgba(79,63,219,0.26)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[rgba(95,78,222,0.2)] disabled:cursor-wait disabled:opacity-80 sm:h-[53px]";

export function AuthAlert({ tone, children }: { tone: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-100 bg-red-50 text-red-600",
    success: "border-emerald-100 bg-emerald-50 text-emerald-700",
    info: "border-[#e6e4fb] bg-[#f6f5ff] text-[#4b4a63]",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("mb-5 flex items-start gap-2.5 rounded-[11px] border p-3.5 text-sm", styles)}>
      {children}
    </div>
  );
}
