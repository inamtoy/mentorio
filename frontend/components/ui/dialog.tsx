"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogContent({ children, className }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-md" />
      <RadixDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-lg border border-slate-100 max-h-[85vh] overflow-y-auto focus:outline-none",
          className
        )}
      >
        <RadixDialog.Close className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 focus:outline-none">
          <X className="h-4 w-4" />
        </RadixDialog.Close>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/** A record's detail view (student, teacher, group) opened over its list —
 * the list stays where it was underneath instead of the detail being
 * appended below it, which meant scrolling past every row to reach it. The
 * panel renders its own visible header, so the title is screen-reader only. */
export function DetailDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-5xl w-[calc(100%-2rem)]">
        <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
        {children}
      </DialogContent>
    </RadixDialog.Root>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-6 pt-5 pb-4 border-b border-slate-50">{children}</div>;
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return (
    <RadixDialog.Title className="text-base font-semibold text-slate-900">
      {children}
    </RadixDialog.Title>
  );
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return (
    <RadixDialog.Description className="text-xs text-slate-400 mt-0.5">
      {children}
    </RadixDialog.Description>
  );
}

export function DialogBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-6 py-5 space-y-4", className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-50">
      {children}
    </div>
  );
}
