import { test, expect } from "@playwright/test";

test("search button shows busy state and is disabled while in-flight", async ({ page }) => {
  // Hold the rank request open so we can observe the busy state.
  await page.route("**/api/rank", async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "test-job" }),
    });
  });

  // SSE endpoint: send nothing so the UI stays "busy".
  await page.route("**/api/progress/test-job", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "",
    }),
  );

  await page.goto("/");
  const btn = page.locator("#queue-btn");
  await btn.click();

  await expect(btn).toContainText(/searching/i);
  await expect(btn).toBeDisabled();
  await expect(btn.locator(".spinner")).toBeVisible();
});
