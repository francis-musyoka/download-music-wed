import { test, expect } from "vitest";
import { UnderstandCache } from "../understandCache.ts";

test("returns undefined on miss", () => {
    const c = new UnderstandCache<number>(3);
    expect(c.get("a")).toBe(undefined);
});

test("returns value on hit", () => {
    const c = new UnderstandCache<number>(3);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
});

test("evicts least-recently-used when over capacity", () => {
    const c = new UnderstandCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.get("a")).toBe(undefined);
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
});

test("get promotes entry to most-recently-used", () => {
    const c = new UnderstandCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect(c.get("a")).toBe(1);
    expect(c.get("b")).toBe(undefined);
    expect(c.get("c")).toBe(3);
});

test("set on existing key updates value and promotes", () => {
    const c = new UnderstandCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("a", 10);
    c.set("c", 3);
    expect(c.get("a")).toBe(10);
    expect(c.get("b")).toBe(undefined);
});
