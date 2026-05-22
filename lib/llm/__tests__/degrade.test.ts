import { test } from "node:test";
import assert from "node:assert/strict";
import { rerankCandidatesSafe } from "../rerankCandidates.ts";

// These tests do not mock the SDK. Instead they disable the LLM via env
// (OPENAI_ENABLED=false or no key) and assert the degrade contract. This is
// the behavior the orchestrator depends on when the real client errors.

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
