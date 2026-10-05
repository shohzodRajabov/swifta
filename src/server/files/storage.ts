import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, GetBucketCorsCommand, HeadObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage: S3-compatible bucket in production (Railway Bucket), local disk in development.
 * STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_ENDPOINT.
 */
const driver = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
const LOCAL_ROOT = path.resolve(process.cwd(), "uploads");

let client: S3Client | null = null;
function s3() {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    });
  }
  return client;
}
const bucket = () => process.env.S3_BUCKET ?? "";

function localPath(key: string) {
  const full = path.resolve(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT)) throw new Error("invalid storage key");
  return full;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (driver === "s3") {
    await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export async function getObject(key: string): Promise<Buffer> {
  if (driver === "s3") {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}

export async function deleteObject(key: string) {
  if (driver === "s3") {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    return;
  }
  await unlink(localPath(key)).catch(() => undefined);
}

/** Short-lived direct download URL (S3), or null when files are served by the app (local driver). */
export async function signedUrl(key: string, fileName: string, inline: boolean): Promise<string | null> {
  if (driver !== "s3") return null;
  const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: disposition }),
    { expiresIn: 300 },
  );
}

export const storageDriver = driver;

/** Browser → bucket direct uploads (no double transfer through the app). Only with the S3 driver. */
export const directUploads = () => driver === "s3";

/** Presigned PUT for one object; the browser must send the same Content-Type. */
export async function presignedPut(key: string, contentType: string, expiresIn = 1800) {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn });
}

/** Size of a stored object, or null when it doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  if (driver === "s3") {
    try {
      const h = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return h.ContentLength ?? 0;
    } catch {
      return null;
    }
  }
  try {
    return (await readFile(localPath(key))).length;
  } catch {
    return null;
  }
}

/** First bytes of an object (file signature check without downloading it all). */
export async function objectHead(key: string, bytes = 16): Promise<Buffer> {
  if (driver === "s3") {
    const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return (await readFile(localPath(key))).subarray(0, bytes);
}

/**
 * Allows the app's own origins to PUT into the bucket from the browser (idempotent; run on start).
 * Uses the server's credentials — nothing is exposed.
 */
export async function ensureBucketCors(origins: string[]) {
  if (driver !== "s3" || origins.length === 0) return "skip";
  const wanted = [...new Set(origins)].sort();
  try {
    const cur = await s3().send(new GetBucketCorsCommand({ Bucket: bucket() }));
    const have = (cur.CORSRules ?? []).flatMap((r) => (r.AllowedMethods?.includes("PUT") ? (r.AllowedOrigins ?? []) : []));
    if (wanted.every((o) => have.includes(o))) return "ok";
  } catch {
    // no CORS configured yet
  }
  await s3().send(
    new PutBucketCorsCommand({
      Bucket: bucket(),
      CORSConfiguration: {
        CORSRules: [{ AllowedOrigins: wanted, AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }],
      },
    }),
  );
  return "set";
}
