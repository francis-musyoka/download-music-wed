import { test, expect } from "vitest";
import { applyNoiseFilter } from "../scoring/noiseFilter.ts";
import type { Track } from "../../types.ts";

function track(partial: Partial<Track>): Track {
    return { title: "x", artist: "y", ...partial };
}

test("keeps canonical afrobeats track", () => {
    const out = applyNoiseFilter([track({ title: "Rush", artist: "Ayra Starr", duration: 186 })], "genre");
    expect(out.length).toBe(1);
});

test("drops type-beat title", () => {
    const out = applyNoiseFilter(
        [track({ title: "Joeboy Type Beat | Afrobeat Instrumental 2022 | SUNSET", artist: "Montayyne" })],
        "genre",
    );
    expect(out.length).toBe(0);
});

test("drops exact 'official mix' phrase (but not '(Official)' alone)", () => {
    // Legitimate music videos often end in "(Official)" — we must NOT drop those.
    const legit = applyNoiseFilter(
        [track({ title: "Calm Down (Official)", artist: "Rema", duration: 200 })],
        "genre",
    );
    expect(legit.length, "must not drop (Official) alone").toBe(1);

    // The exact phrase "official mix" still drops.
    const remix = applyNoiseFilter(
        [track({ title: "Some Track (Official Mix)", artist: "DJ X", duration: 240 })],
        "genre",
    );
    expect(remix.length).toBe(0);
});

test("artist-string filter requires ≥3 separators AND an underscore (conservative)", () => {
    // This is conservative by design — subtler noise (e.g., a 2-separator artist
    // with an underscore) should be caught downstream by the LLM rerank, not
    // here. We prefer under-filtering to dropping legitimate collaborators.
    const twoSep = applyNoiseFilter(
        [track({ title: "Any", artist: "A, B & C_x", duration: 200 })],
        "genre",
    );
    expect(twoSep.length, "2 separators + underscore should pass").toBe(1);

    const threeSepWithUnderscore = applyNoiseFilter(
        [track({ title: "Any", artist: "A, B & C, D_x", duration: 200 })],
        "genre",
    );
    expect(threeSepWithUnderscore.length).toBe(0);
});

test("drops genre track exceeding 480s (8 min cutoff)", () => {
    const out = applyNoiseFilter([track({ title: "Tobetsa", artist: "Myztro", duration: 600 })], "genre");
    expect(out.length).toBe(0);
});

test("drops genre/artist track shorter than 120s (snippet/intro)", () => {
    const row = track({ title: "Short Snippet", artist: "Some Band", duration: 60 });
    expect(applyNoiseFilter([row], "genre").length).toBe(0);
    expect(applyNoiseFilter([row], "artist").length).toBe(0);
    // mode=song bypasses duration bounds
    expect(applyNoiseFilter([row], "song").length).toBe(1);
});

test("keeps long track only when mode=song", () => {
    const row = track({ title: "Long Jam", artist: "Some Band", duration: 600 });
    expect(applyNoiseFilter([row], "song").length).toBe(1);
    expect(applyNoiseFilter([row], "artist").length).toBe(0);
});

test("matches standalone 'mix' (wider filter — relies on LLM rerank for context)", () => {
    // The wider NOISE_TITLE_RE intentionally matches \bmix\b on its own. Real
    // titles containing the word "mix" (e.g. "Your Mix of My Heart") will be
    // dropped here; the LLM rerank stage is responsible for recovering any
    // false positives. This test pins the conservative-vs-wide tradeoff.
    const out = applyNoiseFilter([track({ title: "Your Mix of My Heart", artist: "Any", duration: 200 })], "genre");
    expect(out.length).toBe(0);
});

test("drops karaoke", () => {
    const out = applyNoiseFilter([track({ title: "Calm Down (Karaoke)", artist: "Rema", duration: 200 })], "genre");
    expect(out.length).toBe(0);
});

test("drops sped-up variant (both 'sped up' and 'sped-up')", () => {
    const a = applyNoiseFilter([track({ title: "Rush (Sped Up)", artist: "Ayra Starr", duration: 150 })], "genre");
    const b = applyNoiseFilter([track({ title: "Rush - Sped-Up Version", artist: "Ayra Starr", duration: 150 })], "genre");
    expect(a.length).toBe(0);
    expect(b.length).toBe(0);
});
