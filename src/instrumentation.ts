export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.ENABLE_SCHEDULER === "1") {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
  if (process.env.STORAGE_DRIVER === "s3") {
    // Direct browser uploads need the bucket to accept PUTs from the app's origins.
    const { ensureBucketCors } = await import("./server/files/storage");
    const origins = (process.env.APP_ORIGINS ?? "https://swifta.uz,https://www.swifta.uz")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (process.env.RAILWAY_PUBLIC_DOMAIN) origins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    ensureBucketCors(origins)
      .then((r) => console.log(`[storage] bucket CORS: ${r}`))
      .catch((e) => console.warn("[storage] bucket CORS not set:", (e as Error).message));
  }
}
