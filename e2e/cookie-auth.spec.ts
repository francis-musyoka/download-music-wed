import { test, expect } from "@playwright/test";

test("cross-session progress access returns 404", async ({ browser }) => {
  const sessionA = await browser.newContext();
  const sessionB = await browser.newContext();

  const pageA = await sessionA.newPage();
  await pageA.route("**/api/rank", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Set-Cookie": "dm_session=session-a-token; Path=/; HttpOnly; SameSite=Lax" },
      body: JSON.stringify({ jobId: "abc-123" }),
    });
  });
  await pageA.route("**/api/progress/abc-123", (route) => {
    const cookie = route.request().headers()["cookie"] ?? "";
    if (cookie.includes("dm_session=session-a-token")) {
      route.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
    } else {
      route.fulfill({ status: 404, body: "Not found" });
    }
  });

  await pageA.goto("/");
  await pageA.locator("#queue-btn").click();
  await sessionA.close();

  const pageB = await sessionB.newPage();
  await pageB.route("**/api/progress/abc-123", (route) => {
    const cookie = route.request().headers()["cookie"] ?? "";
    if (cookie.includes("dm_session=session-a-token")) {
      route.fulfill({ status: 200, body: "" });
    } else {
      route.fulfill({ status: 404, body: "Not found" });
    }
  });
  const res = await pageB.request.get(`/api/progress/abc-123`);
  expect(res.status()).toBe(404);

  await sessionB.close();
});
