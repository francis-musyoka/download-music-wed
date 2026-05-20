import { test, expect, beforeEach } from "vitest";
import {
    checkOverallDaily,
    checkExpensiveDaily,
    incrementOverallDaily,
    incrementExpensiveDaily,
    readDailyQuota,
    _resetForTest,
} from "../limits";

beforeEach(() => {
    _resetForTest();
});

test("checkOverallDaily allows when under limit", () => {
    expect(checkOverallDaily("session1")).toBeNull();
});

test("checkOverallDaily blocks at 150 unconditionally", () => {
    for (let i = 0; i < 150; i++) incrementOverallDaily("session1");
    expect(checkOverallDaily("session1")).not.toBeNull();
});

test("checkExpensiveDaily allows when under expensive limit", () => {
    expect(checkExpensiveDaily("session1")).toBeNull();
});

test("checkExpensiveDaily blocks at 12", () => {
    for (let i = 0; i < 12; i++) incrementExpensiveDaily("session1");
    expect(checkExpensiveDaily("session1")).not.toBeNull();
});

test("overall and expensive counters are independent", () => {
    for (let i = 0; i < 20; i++) incrementOverallDaily("session1");
    expect(checkOverallDaily("session1")).toBeNull();      // 20 of 150
    expect(checkExpensiveDaily("session1")).toBeNull();    // 0 of 12
});

test("readDailyQuota returns both tiers", () => {
    incrementOverallDaily("session1");
    incrementOverallDaily("session1");
    incrementExpensiveDaily("session1");
    const q = readDailyQuota("session1");
    expect(q.overall.used).toBe(2);
    expect(q.overall.limit).toBe(150);
    expect(q.expensive.used).toBe(1);
    expect(q.expensive.limit).toBe(12);
});

test("sessions are isolated", () => {
    for (let i = 0; i < 150; i++) incrementOverallDaily("session1");
    expect(checkOverallDaily("session2")).toBeNull();
});
