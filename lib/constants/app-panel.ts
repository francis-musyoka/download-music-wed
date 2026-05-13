import type { Mode } from "@/lib/types";

export const BUTTON_LABELS: Record<Mode, string> = {
    genre: "Search top tracks",
    artist: "Search top tracks",
    song: "Search this song",
    url: "Download now",
};

export const MODE_HEADINGS: Record<Mode, string> = {
    genre: "Dig a genre.",
    artist: "Dig an artist.",
    song: "Find a song.",
    url: "Pull a URL.",
};
