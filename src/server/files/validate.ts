import "server-only";

/** Allowed uploads: Word, Excel, PDF, images (+ CSV). Checked by extension AND file signature. */
const TYPES: Record<string, { mime: string; magic: (b: Buffer) => boolean }> = {
  pdf: { mime: "application/pdf", magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: isZip },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: isZip },
  doc: { mime: "application/msword", magic: isOle },
  xls: { mime: "application/vnd.ms-excel", magic: isOle },
  csv: { mime: "text/csv", magic: isText },
  jpg: { mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  jpeg: { mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: "image/png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  webp: { mime: "image/webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};

function isZip(b: Buffer) {
  return b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
}
function isOle(b: Buffer) {
  return b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}
function isText(b: Buffer) {
  return !b.subarray(0, 512).includes(0);
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp";
export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"];

export type ValidatedFile = { ext: string; mime: string; safeName: string };

/** Returns the validated type, or an error key from the `errors` namespace. */
export function validateUpload(fileName: string, size: number, head: Buffer): ValidatedFile | { error: string } {
  if (size <= 0) return { error: "fileEmpty" };
  if (size > MAX_UPLOAD_BYTES) return { error: "fileTooLarge" };
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  if (!type) return { error: "fileType" };
  if (!type.magic(head)) return { error: "fileType" };
  const safeName = fileName
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(-120) || `file.${ext}`;
  return { ext, mime: type.mime, safeName };
}
