export interface HowItWorksStep {
    n: string;
    title: string;
    body: string;
}

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
    {
        n: "01",
        title: "Pick your mode",
        body: "Genre, artist, song title, or a direct URL. Each mode taps a different scraping path.",
    },
    {
        n: "02",
        title: "We scan the web",
        body: "Crate-digs through curated genre playlists for real, human-picked hits. Enriches each candidate with stream counts and release dates.",
    },
    {
        n: "03",
        title: "Smart ranking",
        body: "Each candidate gets a hit score: playlist appearances × position × views × recency. Mixes and compilations are filtered out.",
    },
    {
        n: "04",
        title: "Diversity cap",
        body: "Genre mode caps any single artist at 2 songs so the chart reflects a scene, not a superstar's catalogue.",
    },
    {
        n: "05",
        title: "Preview in place",
        body: "Each ranked track streams in your browser with scrub support. No commitment — skip anything that doesn't grab you in ten seconds.",
    },
    {
        n: "06",
        title: "Take what you love",
        body: "Download one track at 320kbps, grab the whole chart as a ZIP, or export an M3U playlist any player can read.",
    },
];
