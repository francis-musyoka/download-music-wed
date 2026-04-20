import { test, expect } from "@playwright/test";

const MOCK_TRACKS = [
  { videoId: "aaaaaaaaaaa", title: "Song One", artist: "Artist A", duration: 200, views: 1000, source: "youtube" },
];

test("custom audio player replaces native controls", async ({ page }) => {
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
      body: `event: done\ndata: ${JSON.stringify({ stage: "complete", result: MOCK_TRACKS })}\n\n`,
    }),
  );
  await page.route("**/api/preview/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ streamUrl: "data:audio/mpeg;base64,", expiresAtMs: Date.now() + 3600_000 }),
    }),
  );

  await page.goto("/");
  await page.locator("#queue-btn").click();
  await page.locator(".chart__row .icon-btn.primary").first().click();

  const player = page.locator(".player.player--open");
  await expect(player).toBeVisible();
  await expect(player.locator(".player__btn")).toBeVisible();
  await expect(player.locator(".player__bar")).toBeVisible();
  await expect(player.locator(".player__close")).toBeVisible();

  // No native <audio controls> attribute anywhere in the page.
  const controlsCount = await page.locator("audio[controls]").count();
  expect(controlsCount).toBe(0);

  await player.locator(".player__close").click();
  await expect(page.locator(".player--open")).toHaveCount(0);
});
