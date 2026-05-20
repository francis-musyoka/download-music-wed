import { test, expect, beforeEach } from "vitest";
import { normalizeQueryKey, getSeen, markSeen, _resetForTest } from "../seenTracks";

beforeEach(() => {
    _resetForTest();
});

test("normalizeQueryKey produces the same key for case-and-whitespace variants", () => {
    expect(normalizeQueryKey("genre", "Afrobeats")).toBe(normalizeQueryKey("genre", "afrobeats"));
    expect(normalizeQueryKey("genre", "  afro  beats  ")).toBe(normalizeQueryKey("genre", "afro beats"));
});

test("normalizeQueryKey distinguishes modes", () => {
    expect(normalizeQueryKey("genre", "wizkid")).not.toBe(normalizeQueryKey("artist", "wizkid"));
});

test("getSeen returns empty set when nothing marked", () => {
    expect(getSeen("session1", "genre:afrobeats").size).toBe(0);
});

test("markSeen accumulates ids per (session, queryKey)", () => {
    markSeen("session1", "genre:afrobeats", ["a", "b"]);
    markSeen("session1", "genre:afrobeats", ["b", "c"]);
    const seen = getSeen("session1", "genre:afrobeats");
    expect(seen.has("a")).toBe(true);
    expect(seen.has("b")).toBe(true);
    expect(seen.has("c")).toBe(true);
    expect(seen.size).toBe(3);
});

test("sessions are isolated", () => {
    markSeen("session1", "genre:afrobeats", ["a"]);
    markSeen("session2", "genre:afrobeats", ["b"]);
    expect(getSeen("session1", "genre:afrobeats").has("b")).toBe(false);
    expect(getSeen("session2", "genre:afrobeats").has("a")).toBe(false);
});

test("query keys are isolated", () => {
    markSeen("session1", "genre:afrobeats", ["a"]);
    markSeen("session1", "genre:bongo", ["b"]);
    expect(getSeen("session1", "genre:afrobeats").has("b")).toBe(false);
});

test("getSeen returns a defensive copy — mutations don't leak back", () => {
    markSeen("session1", "genre:afrobeats", ["a", "b"]);
    const seen = getSeen("session1", "genre:afrobeats");
    seen.delete("a");
    seen.add("z");
    // Original state must be unaffected
    const fresh = getSeen("session1", "genre:afrobeats");
    expect(fresh.has("a")).toBe(true);
    expect(fresh.has("b")).toBe(true);
    expect(fresh.has("z")).toBe(false);
    expect(fresh.size).toBe(2);
});

test("markSeen is a no-op for empty trackIds", () => {
    markSeen("session1", "genre:afrobeats", []);
    expect(getSeen("session1", "genre:afrobeats").size).toBe(0);
});
