export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ENABLE_SCHEDULER === "1") {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
}
