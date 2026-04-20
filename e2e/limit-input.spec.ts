import { test, expect } from "@playwright/test";

test("limit input can be cleared and retyped", async ({ page }) => {
  await page.goto("/");
  const limit = page.locator('input[type="number"]').first();

  await limit.fill("");
  await limit.pressSequentially("7");
  await expect(limit).toHaveValue("7");
  await limit.blur();
  await expect(limit).toHaveValue("7");
});

test("limit input clamps to 20 on blur when over max", async ({ page }) => {
  await page.goto("/");
  const limit = page.locator('input[type="number"]').first();

  await limit.fill("25");
  await limit.blur();
  await expect(limit).toHaveValue("20");
});

test("limit input clamps to 1 on blur when cleared", async ({ page }) => {
  await page.goto("/");
  const limit = page.locator('input[type="number"]').first();

  await limit.fill("");
  await limit.blur();
  await expect(limit).toHaveValue("1");
});
