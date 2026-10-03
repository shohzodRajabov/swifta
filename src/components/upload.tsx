"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

export const ACCEPT_DOCS = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp";
export const ACCEPT_IMAGES = ".jpg,.jpeg,.png,.webp";

/** Downscale large photos in the browser before upload (saves mobile data and storage). */
async function compressImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_500_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 2000;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Upload button posting to /api/upload with extra fields; refreshes the page on success. */
export function UploadButton({
  fields,
  accept = ACCEPT_DOCS,
  label,
  variant = "secondary",
  className,
  getFields,
  icon,
}: {
  fields: Record<string, string>;
  accept?: string;
  label: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  /** Read extra fields at upload time (e.g. from sibling inputs). */
  getFields?: () => Record<string, string> | null;
  icon?: ReactNode;
}) {
  const t = useTranslations("errors");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    const extra = getFields ? getFields() : {};
    if (extra === null) {
      e.target.value = "";
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const original of Array.from(list)) {
        const file = await compressImage(original);
        const body = new FormData();
        for (const [k, v] of Object.entries({ ...fields, ...extra })) body.set(k, v);
        body.set("file", file);
        const res = await fetch("/api/upload", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok || json.error) {
          setError(json.error ?? "unknown");
          break;
        }
      }
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={cn(buttonClass(variant), className)}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : (icon ?? <Upload className="size-4" aria-hidden />)}
        {label}
      </button>
      <input ref={input} type="file" accept={accept} multiple={fields.purpose === "attachment"} className="hidden" onChange={onChange} />
      {error && <span className="text-xs text-danger">{t(error)}</span>}
    </span>
  );
}
