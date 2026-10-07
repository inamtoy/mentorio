import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Calendar as CalendarIcon, Check, ChevronDown, Search } from "lucide-react";
import { useLocale } from "next-intl";
import { cn, parseLocalDate } from "@/lib/utils";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { Calendar } from "./calendar";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
}

/** Keeps digits and at most one decimal point — everything else (a second
 * ".", letters, "-", paste noise) is dropped rather than rejected outright,
 * so pasting "1,000" still lands as "1000" instead of being ignored. */
function sanitizeNumeric(raw: string): string {
  const digitsAndDots = raw.replace(/[^\d.]/g, "");
  const firstDot = digitsAndDots.indexOf(".");
  if (firstDot === -1) return digitsAndDots;
  return digitsAndDots.slice(0, firstDot + 1) + digitsAndDots.slice(firstDot + 1).replace(/\./g, "");
}

export function Input({ icon, error, className, type, onChange, onFocus, ...props }: InputProps) {
  // type="number" renders as a real <input type="number"> here — this has
  // two bad, hard-to-notice-in-review side effects: (1) browser spinner
  // arrows that don't match this design system anywhere else, and (2) a
  // real bug where a controlled number input seeded at 0 shows "01000"
  // instead of "1000" when a user types into it, because the browser
  // normalizes "01" -> 1 numerically while leaving "01" as the displayed
  // text, and React's diffing (comparing against the *value* prop, which
  // did change to 1) doesn't realize the *text* still needs correcting.
  // Text inputs don't have either problem, so numeric fields render as one
  // instead, keyboard hinted via inputMode and filtered via sanitizeNumeric
  // — callers' existing `Number(e.target.value)` onChange handlers keep
  // working unmodified since e.target.value is cleaned before they see it.
  const isNumeric = type === "number";
  const isDate = type === "date";

  // Same "component itself decides the browser default isn't good enough"
  // move as the numeric branch above, for the same reason: `type="date"`'s
  // calendar popup is entirely OS/browser-rendered and impossible to
  // restyle with CSS, so it always looks foreign next to the app's own
  // <Select> dropdown (see components/ui/calendar.tsx). Swapped for a
  // Popover-driven <Calendar>, transparent to callers — `value`/`onChange`
  // keep the exact "YYYY-MM-DD" string contract a real date input has.
  if (isDate) {
    return (
      <DateField
        value={typeof props.value === "string" ? props.value : ""}
        onChange={(e) => onChange?.(e as unknown as React.ChangeEvent<HTMLInputElement>)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        error={error}
        className={className}
      />
    );
  }

  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
      )}
      <input
        type={isNumeric ? "text" : type}
        inputMode={isNumeric ? "decimal" : props.inputMode}
        onChange={
          isNumeric
            ? (e) => {
                const cleaned = sanitizeNumeric(e.target.value);
                if (cleaned !== e.target.value) e.target.value = cleaned;
                onChange?.(e);
              }
            : onChange
        }
        onFocus={(e) => {
          onFocus?.(e);
          if (isNumeric) e.target.select();
        }}
        className={cn(
          "h-9 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all",
          icon && "pl-9",
          error && "border-red-300 focus:ring-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

interface DateFieldProps {
  value: string;
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}

function DateField({ value, onChange, placeholder, disabled, error, className }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const displayValue = value
    ? formatLocalizedDate(parseLocalDate(value), locale, { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div className="relative">
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "h-9 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:cursor-not-allowed disabled:opacity-50",
              value ? "text-slate-900" : "text-slate-400",
              error && "border-red-300 focus:ring-red-500",
              className
            )}
          >
            <span className="truncate">{displayValue || placeholder || ""}</span>
            <CalendarIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            className="z-50 rounded-xl border border-slate-100 bg-white shadow-lg"
          >
            <Calendar
              selected={value || undefined}
              onSelect={(iso) => {
                onChange?.({ target: { value: iso } });
                setOpen(false);
              }}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Input
      icon={<Search className="h-4 w-4" />}
      className={cn("w-64", className)}
      placeholder="Search..."
      {...props}
    />
  );
}

interface SelectProps {
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  "aria-label"?: string;
}

// Radix's <Select.Item> rejects value="" outright (empty string is reserved
// internally to mean "nothing selected") — but this codebase's filter
// dropdowns commonly model their "All" option as a real, selectable
// { value: "", label: "..." } entry, not just a placeholder. Rather than
// touch every one of the ~70 call sites to pick a different sentinel, this
// swap happens invisibly at the edges here: "" only ever exists in the
// props this component receives and the onChange it calls, never inside
// Radix itself.
const EMPTY_VALUE_SENTINEL = "__empty__";

export function Select({ options, value, onChange, placeholder, className, disabled, name, ...props }: SelectProps) {
  // Only remap "" to the sentinel when some real option actually uses ""
  // as its value (the "All X" filter pattern the comment above describes).
  // Otherwise "" means "nothing selected yet" (an optional field with no
  // empty option in its list) — passed through to Radix as-is, since its
  // own shouldShowPlaceholder() only recognizes "" or undefined, never the
  // sentinel, as "show the placeholder". Without this guard, an optional
  // Select stuck at value="" renders completely blank instead of the
  // placeholder, because Radix sees a "selected" value matching no Item.
  const hasEmptyOption = options.some((opt) => opt.value === "");
  return (
    <SelectPrimitive.Root
      value={value === "" && hasEmptyOption ? EMPTY_VALUE_SENTINEL : value}
      onValueChange={(v) => onChange?.({ target: { value: v === EMPTY_VALUE_SENTINEL ? "" : v } })}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "h-9 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all cursor-pointer inline-flex items-center justify-between gap-2 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-slate-400",
          className
        )}
        aria-label={props["aria-label"]}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg py-1"
        >
          <SelectPrimitive.Viewport>
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value === "" ? EMPTY_VALUE_SENTINEL : opt.value}
                className="relative flex items-center gap-2 pl-8 pr-3 py-2 text-sm text-slate-700 rounded-lg mx-1 cursor-pointer select-none outline-none data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-700 data-[state=checked]:font-medium"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2.5 inline-flex items-center">
                  <Check className="h-3.5 w-3.5 text-indigo-600" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
