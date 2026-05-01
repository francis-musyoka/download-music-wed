import { test } from "node:test";
import assert from "node:assert/strict";
import { understandQuerySafe } from "../understandQuery.ts";
import { rerankCandidatesSafe } from "../rerankCandidates.ts";

// These tests do not mock the SDK. Instead they disable the LLM via env
// (OPENAI_ENABLED=false or no key) and assert the degrade contract. This is
// the behavior the orchestrator depends on when the real client errors.

test("understandQuerySafe returns degrade when LLM disabled", async () => {
  // LLM_CONFIG is resolved at module load; we can't flip env here reliably.
  // Instead, assert that if the OPENAI_API_KEY is empty in the test env, we
  // get a degrade result. The CI runner must run these tests without a key.
  if (process.env.OPENAI_API_KEY) {
    // Skip when a real key is set — this test asserts degrade-only behavior.
    return;
  }
  const res = await understandQuerySafe({ mode: "genre", input: "dancehall" });
  assert.equal(res.ok, false);
  if (res.ok === false) {
    assert.equal(res.reason, "degrade");
  }
});

test("rerankCandidatesSafe returns degrade when LLM disabled", async () => {
  if (process.env.OPENAI_API_KEY) return;
  const res = await rerankCandidatesSafe({
    mode: "genre",
    intent: {
      mode: "genre",
      canonicalGenre: "dancehall",
      displayName: "Dancehall",
      knownGenre: true,
      spellCorrected: false,
      originalInput: "dancehall",
      searchTerms: [],
    },
    candidates: [{ id: "v1", title: "Tyrant", artist: "Masicka" }],
  });
  assert.equal(res.ok, false);
});

test("rerankCandidatesSafe returns empty ok when given empty candidates", async () => {
  const res = await rerankCandidatesSafe({
    mode: "genre",
    intent: {
      mode: "genre",
      canonicalGenre: "dancehall",
      displayName: "Dancehall",
      knownGenre: true,
      spellCorrected: false,
      originalInput: "dancehall",
      searchTerms: [],
    },
    candidates: [],
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.kept.length, 0);
    assert.equal(res.dropped.length, 0);
  }
});
