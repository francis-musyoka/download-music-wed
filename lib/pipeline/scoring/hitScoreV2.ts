import type { Track } from "@/lib/types";

const WEIGHTS = {
    popularity: 50,
    editorialPlaylistCount: 30,
    recency: 20,
};

function minMaxNormalize(values: number[]): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((v) => (v - min) / range);
}

function recencyScore(releaseDate?: string): number {
    if (!releaseDate) return 0.3;
    // Spotify release_date may be YYYY, YYYY-MM, or YYYY-MM-DD. Date constructor handles all.
    const d = new Date(releaseDate);
    if (isNaN(d.getTime())) return 0.3;
    const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
    if (days < 30) return 1.0;
    if (days < 90) return 0.7;
    if (days < 180) return 0.4;
    if (days < 365) return 0.2;
    return 0.1;
}

export function rankSpotifyCandidates(candidates: Track[]): Track[] {
    if (candidates.length === 0) return [];

    const popularities = candidates.map((c) => c.popularity ?? 0);
    const editorialCounts = candidates.map((c) => c.editorialPlaylistCount ?? 0);
    const recencies = candidates.map((c) => recencyScore(c.releaseDate));

    const nPop = minMaxNormalize(popularities);
    const nEd = minMaxNormalize(editorialCounts);

    const scored = candidates.map((c, i) => ({
        ...c,
        score:
            WEIGHTS.popularity * nPop[i] +
            WEIGHTS.editorialPlaylistCount * nEd[i] +
            WEIGHTS.recency * recencies[i],
    }));

    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored;
}
