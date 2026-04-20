import { test, expect } from "@playwright/test";

const MOCK_TRACKS = [
  { videoId: "aaaaaaaaaaa", title: "Song One", artist: "Artist A", duration: 200, views: 1000, source: "youtube" },
  { videoId: "bbbbbbbbbbb", title: "Song Two", artist: "Artist B", duration: 210, views: 2000, source: "youtube" },
];

// Build a 10-second silent 8-bit mono 8kHz WAV as a data URL. Needs to be
// *long enough* that the test has time to observe the "playing" state before
// the audio ends (a very short clip fires play→pause and the UI snaps back).
function silentWavDataUrl(durationSec = 10): string {
  const sr = 8000;
  const n = sr * durationSec;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  // RIFF header
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  dv.setUint32(4, 36 + n, true);
  buf.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  buf.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr, true); // byte rate
  dv.setUint16(32, 1, true); // block align
  dv.setUint16(34, 8, true); // bits per sample
  buf.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  dv.setUint32(40, n, true);
  buf.fill(128, 44); // silence center for 8-bit unsigned
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return "data:audio/wav;base64," + Buffer.from(binary, "binary").toString("base64");
}

test("play button swaps to pause on the clicked row", async ({ page }) => {
  const SILENT_WAV = silentWavDataUrl(10);

  await page.route("**/api/rank", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "job-1" }),
    }),
  );

  await page.route("**/api/progress/job-1", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        `data: ${JSON.stringify({ jobId: "job-1", stage: "scraping-spotify" })}\n\n` +
        `event: done\ndata: ${JSON.stringify({ stage: "complete", result: MOCK_TRACKS })}\n\n`,
    }),
  );

  await page.route("**/api/preview/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ streamUrl: SILENT_WAV, expiresAtMs: Date.now() + 3600_000 }),
    }),
  );

  await page.goto("/");
  await page.locator("#queue-btn").click();

  const rowButtons = page.locator(".chart__row .icon-btn.primary");
  await expect(rowButtons).toHaveCount(2);

  await rowButtons.nth(0).click();
  await expect(rowButtons.nth(0)).toHaveText("⏸");
  await expect(rowButtons.nth(1)).toHaveText("▶");
});
