type SeenEntry = { trackIds: Set<string>; lastSeenAt: number };

type GlobalWithSeen = typeof globalThis & {
    __downloadMusicSeenTracks?: Map<string, Map<string, SeenEntry>>;
};

const g = globalThis as GlobalWithSeen;
const seen: Map<string, Map<string, SeenEntry>> =
    g.__downloadMusicSeenTracks ?? (g.__downloadMusicSeenTracks = new Map());

export type SeenMode = "genre" | "artist";

export function normalizeQueryKey(mode: SeenMode, input: string): string {
    const norm = input.trim().toLowerCase().replace(/\s+/g, " ");
    return `${mode}:${norm}`;
}

export function getSeen(sessionId: string, queryKey: string): Set<string> {
    const bySession = seen.get(sessionId);
    if (!bySession) return new Set();
    const entry = bySession.get(queryKey);
    if (!entry) return new Set();
    return new Set(entry.trackIds);
}

export function markSeen(sessionId: string, queryKey: string, trackIds: string[]): void {
    if (trackIds.length === 0) return;
    let bySession = seen.get(sessionId);
    if (!bySession) {
        bySession = new Map();
        seen.set(sessionId, bySession);
    }
    let entry = bySession.get(queryKey);
    if (!entry) {
        entry = { trackIds: new Set(), lastSeenAt: Date.now() };
        bySession.set(queryKey, entry);
    }
    for (const id of trackIds) entry.trackIds.add(id);
    entry.lastSeenAt = Date.now();
}

/** Test-only: clear the per-test state without breaking globalThis hoisting. */
export function _resetForTest(): void {
    seen.clear();
}
