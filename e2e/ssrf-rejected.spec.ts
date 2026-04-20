import { test, expect } from "@playwright/test";

test("URL mode rejects non-youtube URL with a toast", async ({ page }) => {
  await page.route("**/api/download", async (route, request) => {
    const body = request.postDataJSON() as { url?: string };
    if (body.url && !body.url.includes("youtube.com") && !body.url.includes("youtu.be")) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "URL not allowed" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "ok" }),
    });
  });

  await page.goto("/");
  await page.locator('.console__tab', { hasText: "./URL" }).click();
  await page.locator('input[type="text"]').first().fill("http://169.254.169.254/");
  await page.locator("#queue-btn").click();

  const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: /failed|allowed/i }).first();
  await expect(toast).toBeVisible();
});
