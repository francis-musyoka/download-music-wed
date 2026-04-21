export type Mode = "genre" | "artist" | "song" | "url";

export interface Track {
  videoId?: string;
  title: string;
  artist: string;
  duration?: number;
  views?: number;
  plays?: number;
  uploadDate?: string;
  videoUrl?: string;
  score?: number;
  playlistCount?: number;
  bestPosition?: number;
  source?: string;
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
  | "scraping-spotify"
  | "enriching-youtube"
  | "scoring"
  | "downloading"
  | "complete"
  | "failed";

export interface ProgressEvent {
  jobId: string;
  stage: JobStage;
  current?: number;
  total?: number;
  message?: string;
  track?: Track | DownloadedTrack;
  status?: "ok" | "skipped" | "failed";
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
  playwright: boolean;
  diskFreeGb: number | null;
}
