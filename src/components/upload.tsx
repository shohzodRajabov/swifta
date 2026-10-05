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

type Result = { error?: string };

/** PUT straight to the bucket with progress; rejects on network/CORS failure so the caller can fall back. */
function putWithProgress(url: string, file: File, contentType: string, onProgress: (p: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (ev) => ev.lengthComputable && onProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

/**
 * Uploads one file: directly to the bucket when the server allows it (fast, up to 100 MB, with progress),
 * otherwise (local storage, or the direct PUT failed) through /api/upload.
 */
export async function uploadFile(file: File, fields: Record<string, string>, onProgress: (p: number | null) => void = () => undefined): Promise<Result> {
  const init = await fetch("/api/upload/init", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, fields }),
  })
    .then((r) => r.json() as Promise<{ direct?: boolean; url?: string; contentType?: string; ticket?: string; error?: string }>)
    .catch(() => ({ direct: false }) as { direct?: boolean; error?: string; url?: string; contentType?: string; ticket?: string });
  if (init.error) return { error: init.error };
  if (init.direct && init.url && init.ticket) {
    const status = await putWithProgress(init.url, file, init.contentType!, onProgress).catch(() => 0);
    if (status >= 200 && status < 300) {
      const done = (await fetch("/api/upload/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket: init.ticket }) })
        .then((r) => r.json())
        .catch(() => ({ error: "unknown" }))) as Result;
      return done.error ? { error: done.error } : {};
    }
    // Direct upload unavailable (e.g. bucket CORS): fall back to the app route below.
  }
  onProgress(null);
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  body.set("file", file);
  const res = await fetch("/api/upload", { method: "POST", body });
  const json = (await res.json().catch(() => ({ error: res.status === 413 ? "fileTooLarge" : "unknown" }))) as Result;
  return !res.ok || json.error ? { error: json.error ?? "unknown" } : {};
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
  const [progress, setProgress] = useState<number | null>(null);

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
        const result = await uploadFile(file, { ...fields, ...extra }, setProgress);
        if (result.error) {
          setError(result.error);
          break;
        }
      }
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setBusy(false);
      setProgress(null);
      e.target.value = "";
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={cn(buttonClass(variant), className)}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : (icon ?? <Upload className="size-4" aria-hidden />)}
        {label}
        {busy && progress !== null && <span className="num text-xs">{progress}%</span>}
      </button>
      <input ref={input} type="file" accept={accept} multiple={fields.purpose === "attachment"} className="hidden" onChange={onChange} />
      {error && <span className="text-xs text-danger">{t(error)}</span>}
    </span>
  );
}
