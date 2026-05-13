// Next.js calls register() once per server worker on boot. We use it to
// start the in-process disk cleanup sweeper (TODO.md #1). The Node-runtime
// guard + dynamic import keeps node:fs out of edge bundles.

export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { startDiskCleanup } = await import("@/lib/disk-cleanup");
    startDiskCleanup();
}
