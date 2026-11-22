export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { startRequestWorker } = await import("./server/requests/worker");
    startRequestWorker();
  }
}
