import { test, expect, beforeEach } from "vitest";
import { GET } from "../route";
import { _resetForTest, incrementOverallDaily, incrementExpensiveDaily } from "@/lib/limits";

beforeEach(() => {
    _resetForTest();
});

test("GET returns both overall and expensive tiers", async () => {
    // simulate a session cookie so getOrSetSession returns the same id
    const req = new Request("http://localhost/api/quota", {
        headers: { cookie: "dm_session=test-session-123" },
    });
    incrementOverallDaily("test-session-123");
    incrementExpensiveDaily("test-session-123");

    const res = await GET(req);
    const body = await res.json();
    expect(body.overall.used).toBe(1);
    expect(body.overall.limit).toBe(150);
    expect(body.expensive.used).toBe(1);
    expect(body.expensive.limit).toBe(12);
    expect(typeof body.resetAt).toBe("number");
});
