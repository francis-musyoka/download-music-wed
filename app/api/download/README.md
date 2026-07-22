# Download API

How the download endpoints work in this project (WaxMusic / `download-music-web`).

We do **not** host any audio. The server hands a YouTube URL to **yt-dlp**, which resolves the public stream; **ffmpeg** transcodes it to a 320 kbps MP3 (cover art + metadata embedded). The finished file is written to `MUSIC_DIR` and served back over HTTP. The browser tracks progress live over an SSE connection.

Stack: `yt-dlp` (download), `ffmpeg` (transcode), **Deno** on PATH (runs YouTube's signature / n-param challenge solver). All three must be installed.

---

## The flow at a glance

```
POST /api/download           → start a job, returns { jobId } immediately
GET  /api/progress/{jobId}    → SSE stream of progress; ends with an event: done
GET  /api/audio/{file}        → stream/download a single finished MP3 (supports Range)
GET  /api/zip/{jobId}         → download all of a job's MP3s as one ZIP
```

A download is asynchronous. You **start** it, then **subscribe** to progress, then **fetch** the resulting file(s).

Tracks in a multi-track job download **sequentially**, one at a time. A track that fails to download is **skipped, not fatal** — it's dropped from the result and emits a `status: "failed"` progress event, but the job still finishes as `complete` with whatever succeeded. A single-URL job (`downloadByUrl`) throws if its one download fails, so the job ends as `failed`.

---

## `POST /api/download`

Starts a download job. Returns right away with a `jobId` — the work runs in the background.

### Request body (JSON)

You must send **either** `tracks` **or** `url`.

| Field          | Type      | Notes |
|----------------|-----------|-------|
| `url`          | `string`  | A single YouTube URL. Must be HTTPS and on an allowed host (see below). |
| `tracks`       | `Track[]` | Up to **50** tracks to download. Each may carry a `videoUrl`. |
| `playlistName` | `string`  | Optional. Sanitized with `safeFilename()`. When set (and at least one track downloads), an `.m3u` playlist file is written alongside the MP3s. |

`Track` (the fields that matter for download):

```ts
interface Track {
  videoId?: string;   // 11-char YouTube id
  title: string;
  artist: string;
  videoUrl?: string;  // full YouTube URL; if omitted, yt-dlp searches by artist+title
  duration?: number;
  // ...other ranking fields, ignored by the download path
}
```

A track **without** a `videoUrl` is valid — the server falls back to a yt-dlp search (`artist - title official audio`) and picks the best match (right duration, most views, not a mix).

### Validation (enforced at the route boundary)

These run **before** any work starts, in this order.

- **Bearer-token auth** — checked first, before anything else. Requires `Authorization: Bearer <token>`. Fail-closed: a missing or incorrect token always gets rejected with `401` — there's no open-access fallback.
- **Host allowlist + HTTPS only.** Allowed hosts: `youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`. Protocol must be `https:`. Applied to `url` **and** every `tracks[i].videoUrl`.
- **Max 50 tracks** per request.
- **Rate limit** — **8 requests/min per IP**. Over the limit returns `429` with a `Retry-After` header.
- **Concurrency slot** — **4 global concurrent jobs**. If all are taken, returns `429 "Server busy, try again shortly"`.

> Downloads do **not** consume the daily search quota (150 overall / 30 expensive) — that's rank-only.

### Responses

| Status | Body | Meaning |
|--------|------|---------|
| `200`  | `{ "jobId": "<uuid>" }` | Job started. Also sets the `dm_session` cookie. |
| `400`  | `{ "error": "..." }` | Bad JSON, neither `tracks` nor `url`, too many tracks, or a URL outside the allowlist. |
| `401`  | `{ "error": "Unauthorized" }` | Missing or incorrect bearer token. Checked before any other validation. |
| `429`  | `{ "error": "Too many requests" }` (+ `Retry-After`) or `{ "error": "Server busy..." }` | Rate-limited or no free slot. |
| `500`  | `{ "error": "Internal server error" }` | Setup failure. |

> **Session cookie:** the `200` response sets `dm_session`. You **must** send that cookie back on `/api/progress/{jobId}` and `/api/zip/{jobId}` — those endpoints compare it to the job's session and return **404** on mismatch (they don't reveal that the job exists).

### Example

Every request needs the bearer token, whether it's URL mode or bulk `tracks` mode.

```bash
# By URL
curl -i -X POST http://localhost:4000/api/download \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-api-token>' \
  -c cookies.txt \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
# → 200 { "jobId": "8f3c..." }  and a dm_session cookie in cookies.txt
```

```bash
# Bulk — multiple tracks in one request, one job, all downloaded sequentially
curl -i -X POST http://localhost:4000/api/download \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <your-api-token>' \
  -c cookies.txt \
  -d '{
    "tracks": [
      { "title": "Never Gonna Give You Up", "artist": "Rick Astley", "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      { "title": "Some Song", "artist": "Some Artist" }
    ],
    "playlistName": "My Playlist"
  }'
# → 200 { "jobId": "..." } — one job covering both tracks.
# Note: the second track has no videoUrl — the server falls back to a
# yt-dlp search by artist+title. Up to 50 tracks per request (see Validation).
```

---

## `GET /api/progress/{jobId}` — live progress (SSE)

Subscribe to the job's progress. `Content-Type: text/event-stream`. **Send the `dm_session` cookie.**

- Each event is a JSON `ProgressEvent` on a `data:` line.
- Late subscribers get the **full history replayed** immediately, so reconnecting mid-job catches up.
- The stream ends with a named `done` event carrying the final result, then closes.

`ProgressEvent` shape:

```ts
interface ProgressEvent {
  jobId: string;
  stage: JobStage;       // "queued" | "downloading" | "complete" | "failed" | ...
  current?: number;      // e.g. 3
  total?: number;        // e.g. 10  → "downloading 3/10"
  message?: string;
  track?: Track | DownloadedTrack;
  status?: "ok" | "skipped" | "failed";
  note?: string;
}
```

Terminal `done` event payload:

```
event: done
data: { "stage": "complete", "result": DownloadedTrack[], "error": undefined }
```

`DownloadedTrack`:

```ts
interface DownloadedTrack {
  filePath: string;   // server-side absolute path (don't expose to end users)
  fileName: string;   // use this with /api/audio/{file}
  title: string;
  artist: string;
  duration?: number;
  sizeBytes?: number;
}
```

| Status | Meaning |
|--------|---------|
| `200`  | SSE stream. |
| `404`  | Unknown job, or session cookie doesn't match the job's session. |

### Example (browser)

```js
const es = new EventSource(`/api/progress/${jobId}`); // cookies sent automatically
es.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  console.log(ev.stage, ev.current, ev.total, ev.message);
};
es.addEventListener("done", (e) => {
  const { result } = JSON.parse(e.data);   // DownloadedTrack[]
  es.close();
  // fetch files via /api/audio/{fileName} or /api/zip/{jobId}
});
```

---

## `GET /api/audio/{file}` — fetch one MP3

Streams a single finished file from `MUSIC_DIR`. Pass the `fileName` from a `DownloadedTrack`. Supports HTTP `Range` requests (seeking / partial downloads).

- **Path-traversal guarded:** the name is reduced with `path.basename` and the resolved path is verified to stay inside `MUSIC_DIR`. `..`, slashes, etc. are rejected (`403`).
- `400` on undecodable names, `403` on traversal attempts, `404` if the file isn't there.

```
GET /api/audio/Artist%20-%20Title.mp3
```

---

## `GET /api/zip/{jobId}` — download all files as a ZIP

Streams every file in a **completed download job** as a single ZIP (store-only, no compression — MP3s are already compressed). **Send the `dm_session` cookie.**

Returns `404` unless: the job exists, it's a `download` job, its stage is `complete`, it has at least one result file, **and** the session cookie matches.

---

## M3U playlists

If the request included a `playlistName` and at least one track downloaded, an `.m3u` playlist file referencing the downloaded MP3s is written alongside them. This happens last, after all tracks in the job have finished. No M3U is written when `playlistName` is omitted or every track in the job failed.
