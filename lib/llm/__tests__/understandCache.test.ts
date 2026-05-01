import { test } from "node:test";
import assert from "node:assert/strict";
import { UnderstandCache } from "../understandCache.ts";

test("returns undefined on miss", () => {
  const c = new UnderstandCache<number>(3);
  assert.equal(c.get("a"), undefined);
});

test("returns value on hit", () => {
  const c = new UnderstandCache<number>(3);
  c.set("a", 1);
  assert.equal(c.get("a"), 1);
});

test("evicts least-recently-used when over capacity", () => {
  const c = new UnderstandCache<number>(2);
  c.set("a", 1);
  c.set("b", 2);
  c.set("c", 3);
  assert.equal(c.get("a"), undefined);
  assert.equal(c.get("b"), 2);
  assert.equal(c.get("c"), 3);
});

test("get promotes entry to most-recently-used", () => {
  const c = new UnderstandCache<number>(2);
  c.set("a", 1);
  c.set("b", 2);
  c.get("a");
  c.set("c", 3);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("c"), 3);
});

test("set on existing key updates value and promotes", () => {
  const c = new UnderstandCache<number>(2);
  c.set("a", 1);
  c.set("b", 2);
  c.set("a", 10);
  c.set("c", 3);
  assert.equal(c.get("a"), 10);
  assert.equal(c.get("b"), undefined);
});
