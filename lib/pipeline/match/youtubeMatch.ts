const DURATION_TOLERANCE_SEC = 3;
const ACCEPT_THRESHOLD = 0.7;
const REJECT_THRESHOLD = 0.4;

export interface SpotifyMatchTarget {
    id: string;
    name: string;
    artist: string;
    durationMs: number;
}

export interface YtCandidate {
    videoId: string;
    title: string;
    channel: string;
    durationSec: number;
}

function tokenSet(s: string): Set<string> {
    return new Set(
        s
            .toLowerCase()
            .replace(/[^\w\s]/g, " ")
            .split(/\s+/)
            .filter(Boolean),
    );
}

function tokenOverlap(a: string, b: string): number {
    const sa = tokenSet(a);
    const sb = tokenSet(b);
    if (sa.size === 0 || sb.size === 0) return 0;
    let intersect = 0;
    for (const t of sa) if (sb.has(t)) intersect += 1;
    return intersect / Math.min(sa.size, sb.size);
}

function isOfficialChannel(channel: string, artist: string): boolean {
    const c = channel.toLowerCase();
    const a = artist.toLowerCase();
    if (c.endsWith("- topic") || c.endsWith("vevo")) return true;
    if (c.includes(a) && c.includes("official")) return true;
    if (c === a) return true;
    return false;
}

export function confidence(target: SpotifyMatchTarget, yt: YtCandidate): number {
    const durationDelta = Math.abs(target.durationMs / 1000 - yt.durationSec);
    if (durationDelta > DURATION_TOLERANCE_SEC) return 0;

    const titleSim = tokenOverlap(target.name, yt.title);
    // Artist signal: prefer channel match; fall back to title with a penalty
    // because "artist in title" is much weaker evidence than "channel is artist".
    const artistInChannel = tokenOverlap(target.artist, yt.channel);
    const artistInTitle = tokenOverlap(target.artist, yt.title);
    const artistSim = artistInChannel > 0 ? artistInChannel : artistInTitle * 0.5;
    const channelBoost = isOfficialChannel(yt.channel, target.artist) ? 0.2 : 0;

    return titleSim * 0.5 + artistSim * 0.3 + channelBoost;
}

export interface PickOpts {
    /** LLM tiebreaker. Returns the videoId of the chosen candidate or null if none match. */
    askLLM?: (target: SpotifyMatchTarget, borderline: YtCandidate[]) => Promise<string | null>;
}

export async function pickBestMatch(
    target: SpotifyMatchTarget,
    candidates: YtCandidate[],
    opts?: PickOpts,
): Promise<YtCandidate | null> {
    if (candidates.length === 0) return null;

    const scored = candidates
        .map((c) => ({ c, score: confidence(target, c) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;

    const best = scored[0];
    if (best.score >= ACCEPT_THRESHOLD) return best.c;
    if (best.score < REJECT_THRESHOLD) return null;

    // borderline: ask the LLM
    if (!opts?.askLLM) return null;
    const borderline = scored.filter((s) => s.score >= REJECT_THRESHOLD).map((s) => s.c);
    const chosenId = await opts.askLLM(target, borderline);
    return chosenId ? (candidates.find((c) => c.videoId === chosenId) ?? null) : null;
}
