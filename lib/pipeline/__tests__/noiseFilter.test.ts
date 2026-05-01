import { test } from "node:test";
import assert from "node:assert/strict";
import { applyNoiseFilter } from "../scoring/noiseFilter.ts";
import type { Track } from "../../types.ts";

function track(partial: Partial<Track>): Track {
  return { title: "x", artist: "y", ...partial };
}

test("keeps canonical afrobeats track", () => {
  const out = applyNoiseFilter([track({ title: "Rush", artist: "Ayra Starr", duration: 186 })], "genre");
  assert.equal(out.length, 1);
});

test("drops type-beat title", () => {
  const out = applyNoiseFilter(
    [track({ title: "Joeboy Type Beat | Afrobeat Instrumental 2022 | SUNSET", artist: "Montayyne" })],
    "genre",
  );
  assert.equal(out.length, 0);
});

test("drops exact 'official mix' phrase (but not '(Official)' alone)", () => {
  // Legitimate music videos often end in "(Official)" — we must NOT drop those.
  const legit = applyNoiseFilter(
    [track({ title: "Calm Down (Official)", artist: "Rema", duration: 200 })],
    "genre",
  );
  assert.equal(legit.length, 1, "must not drop (Official) alone");

  // The exact phrase "official mix" still drops.
  const remix = applyNoiseFilter(
    [track({ title: "Some Track (Official Mix)", artist: "DJ X", duration: 240 })],
    "genre",
  );
  assert.equal(remix.length, 0);
});

test("artist-string filter requires ≥3 separators AND an underscore (conservative)", () => {
  // This is conservative by design — subtler noise (e.g., a 2-separator artist
  // with an underscore) should be caught downstream by the LLM rerank, not
  // here. We prefer under-filtering to dropping legitimate collaborators.
  const twoSep = applyNoiseFilter(
    [track({ title: "Any", artist: "A, B & C_x", duration: 200 })],
    "genre",
  );
  assert.equal(twoSep.length, 1, "2 separators + underscore should pass");

  const threeSepWithUnderscore = applyNoiseFilter(
    [track({ title: "Any", artist: "A, B & C, D_x", duration: 200 })],
    "genre",
  );
  assert.equal(threeSepWithUnderscore.length, 0);
});

test("drops genre track exceeding 360s", () => {
  const out = applyNoiseFilter([track({ title: "Tobetsa", artist: "Myztro", duration: 391 })], "genre");
  assert.equal(out.length, 0);
});

test("keeps artist track exceeding 360s only when mode=song", () => {
  const row = track({ title: "Long Jam", artist: "Some Band", duration: 480 });
  assert.equal(applyNoiseFilter([row], "song").length, 1);
  assert.equal(applyNoiseFilter([row], "artist").length, 0);
});

test("does not match 'mix' alone — word boundary prevents false positive", () => {
  const out = applyNoiseFilter([track({ title: "Your Mix of My Heart", artist: "Any", duration: 200 })], "genre");
  assert.equal(out.length, 1);
});

test("drops karaoke", () => {
  const out = applyNoiseFilter([track({ title: "Calm Down (Karaoke)", artist: "Rema", duration: 200 })], "genre");
  assert.equal(out.length, 0);
});

test("drops sped-up variant (both 'sped up' and 'sped-up')", () => {
  const a = applyNoiseFilter([track({ title: "Rush (Sped Up)", artist: "Ayra Starr", duration: 150 })], "genre");
  const b = applyNoiseFilter([track({ title: "Rush - Sped-Up Version", artist: "Ayra Starr", duration: 150 })], "genre");
  assert.equal(a.length, 0);
  assert.equal(b.length, 0);
});
