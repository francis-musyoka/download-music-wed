import { test, expect } from "@playwright/test";

// Hits the real dev server — no mocks. Session A creates a job (gets a
// dm_session cookie); session B (fresh context, no cookie) tries to read
// that job's progress and must get 404.
test("cross-session progress access returns 404", async ({ browser }) => {
  const sessionA = await browser.newContext();
  const sessionB = await browser.newContext();

  // Session A: create a job via /api/rank. The runner may fail downstream
  // (no spotify scraper in test env) but the jobId + sessionId are set
  // synchronously before that, which is all we need.
  const resA = await sessionA.request.post("/api/rank", {
    data: { mode: "song", input: "cookie-auth-test-query" },
  });
  expect(resA.status()).toBe(200);
  const { jobId } = (await resA.json()) as { jobId: string };
  expect(jobId).toBeTruthy();

  // Session B: different context, no cookie. Must get 404 — NOT 200 or 403.
  const resB = await sessionB.request.get(`/api/progress/${jobId}`);
  expect(resB.status()).toBe(404);

  // Sanity: session A can still read its own progress (200 or SSE stream).
  const resA2 = await sessionA.request.get(`/api/progress/${jobId}`);
  expect(resA2.status()).toBe(200);

  await sessionA.close();
  await sessionB.close();
});
