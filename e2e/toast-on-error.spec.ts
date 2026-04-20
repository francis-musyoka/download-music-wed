import { test, expect } from "@playwright/test";

test("rank failure shows a toast instead of alert()", async ({ page }) => {
  let nativeAlertOpened = false;
  page.on("dialog", (d) => {
    nativeAlertOpened = true;
    void d.dismiss();
  });

  await page.route("**/api/rank", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "boom" }),
    }),
  );

  await page.goto("/");
  await page.locator("#queue-btn").click();

  const toast = page.locator('[role="status"], [role="alert"]').filter({ hasText: /failed/i }).first();
  await expect(toast).toBeVisible();
  expect(nativeAlertOpened).toBe(false);
});
