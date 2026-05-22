export type Mode = "genre" | "artist" | "song" | "url";

export interface Track {
    videoId?: string;
    title: string;
    artist: string;
    channel?: string;
    duration?: number;
    views?: number;
    plays?: number;
    uploadDate?: string;
    videoUrl?: string;
    score?: number;
    playlistCount?: number;
    bestPosition?: number;
    source?: string;
    /** Position in the originating search API response (0-indexed, lower = higher relevance per YT Music). */
    position?: number;
    /** True if this track was surfaced by the `q+"new"` parallel query in genre mode. Used by hit-score. */
    inNewPool?: boolean;
}

export interface DownloadedTrack {
    filePath: string;
    fileName: string;
    title: string;
    artist: string;
    duration?: number;
    sizeBytes?: number;
}

export type JobStage =
    | "queued"
    | "understanding-query"
    | "scraping-spotify"
    | "enriching-youtube"
    | "enriching-dates"
    | "scoring"
    | "llm-reranking"
    | "llm-reranked"
    | "llm-degraded"
    | "downloading"
    | "complete"
    | "failed";

export type LLMDegradeStep = "understand" | "rerank";

export interface ProgressEvent {
    jobId: string;
    stage: JobStage;
    current?: number;
    total?: number;
    message?: string;
    track?: Track | DownloadedTrack;
    status?: "ok" | "skipped" | "failed";
    note?: string;
    degradeStep?: LLMDegradeStep;
    rerankSummary?: {
        kept: number;
        dropped: number;
        rejectCategories: Record<string, number>;
    };
}

export interface Job {
    id: string;
    sessionId: string;
    holdsSlot: boolean;
    kind: "rank" | "download";
    mode?: Mode;
    input?: string;
    createdAt: number;
    stage: JobStage;
    progress: ProgressEvent[];
    result?: Track[] | DownloadedTrack[];
    error?: string;
    subscribers: Set<(ev: ProgressEvent) => void>;
}

export interface HealthStatus {
    ytdlp: boolean;
    ffmpeg: boolean;
    spotdl: boolean;
    diskFreeGb: number | null;
}

export interface SongInput {
    title: string;
    artist: string;
}

export type RankInput = string | SongInput;
