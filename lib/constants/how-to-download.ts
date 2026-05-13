export interface HowStep {
    n: number;
    title: string;
    body: string;
}

export const HOW_STEPS: HowStep[] = [
    {
        n: 1,
        title: "Choose how to search",
        body: "Pick Genre for a curated chart, Artist for top tracks, Song for a specific title, or paste a URL.",
    },
    {
        n: 2,
        title: "Get ranked results",
        body: "We crate-dig curated playlists, cross-cut stream-count data, score every track, and show you the top hits — sorted by plays, position, and recency.",
    },
    {
        n: 3,
        title: "Preview in your browser",
        body: "Click play on any track to stream it instantly. Scrub, skip, decide — no commitment yet.",
    },
    {
        n: 4,
        title: "Download what you love",
        body: "Save one track, grab them all as a ZIP, or export an M3U playlist that works in any car stereo.",
    },
];
