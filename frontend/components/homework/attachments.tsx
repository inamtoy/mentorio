"use client";

import { useRef, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import {
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  downloadHomeworkAttachment,
  uploadHomeworkAttachment,
  type Attachment,
} from "@/lib/api/homework";
import { toast } from "@/lib/store/toast-store";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove?: () => void }) {
  const t = useTranslations("HomeworkAttachments");
  const Icon = attachment.mime_type.startsWith("image/") ? ImageIcon : FileText;

  async function handleDownload() {
    try {
      await downloadHomeworkAttachment(attachment);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("downloadFailed"));
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 min-w-0">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
      <button
        type="button"
        onClick={handleDownload}
        title={t("download")}
        className="truncate text-xs font-medium text-indigo-600 hover:underline text-left"
      >
        {attachment.original_name}
      </button>
      <span className="flex-shrink-0 text-[11px] text-slate-400">{formatSize(attachment.size_bytes)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("remove")}
          className="ml-auto flex-shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Read-only list; each name downloads the file. Renders nothing when empty. */
export function AttachmentList({ attachments, className }: { attachments: Attachment[]; className?: string }) {
  if (attachments.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {attachments.map((a) => (
        <AttachmentChip key={a.id} attachment={a} />
      ))}
    </div>
  );
}

/** Picks and uploads files right away, keeping `value` as the attachments
 * to save with the form (send their ids as `attachmentIds`). */
export function AttachmentUploader({
  value,
  onChange,
  disabled,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("HomeworkAttachments");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    const room = ATTACHMENT_MAX_COUNT - value.length;
    if (picked.length > room) toast.error(t("tooMany", { count: ATTACHMENT_MAX_COUNT }));

    const accepted = picked.slice(0, Math.max(room, 0)).filter((file) => {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
        toast.error(t("badType", { name: file.name }));
        return false;
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        toast.error(t("tooLarge", { name: file.name }));
        return false;
      }
      return true;
    });

    let next = value;
    setUploading((n) => n + accepted.length);
    for (const file of accepted) {
      try {
        const uploaded = await uploadHomeworkAttachment(file);
        next = [...next, uploaded];
        onChange(next);
      } catch (err) {
        toast.error(err instanceof ApiError ? `${file.name}: ${err.message}` : t("uploadFailed", { name: file.name }));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const full = value.length >= ATTACHMENT_MAX_COUNT;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {value.map((a) => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              onRemove={disabled ? undefined : () => onChange(value.filter((x) => x.id !== a.id))}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || full || uploading > 0}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {uploading > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          {uploading > 0 ? t("uploading") : t("attachButton")}
        </button>
        <span className="text-[11px] text-slate-400">{t("hint", { count: ATTACHMENT_MAX_COUNT })}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
