# Download Music Web — Design Spec

**Date:** 2026-04-20
**Status:** Draft — awaiting implementation plan

## Overview

A web-app version of the existing `download_music` CLI. Users pick a mode (Genre / Artist / Song / URL), preview ranked results in-browser, and download individual MP3s, ZIP archives, or M3U playlists. Deployed to a Contabo VPS.

## Goals

- Ship a single-page web UI wrapping the existing music pipeline
- Preserve the CLI as an experimentation sandbox for ranking/scraping changes
- Structure the project for growth (future: accounts, library page, mobile)
- Dark Spotify-like aesthetic

## Non-goals (v1)

- User accounts / authentication
- Library browser / download history page
- Social features (sharing, comments, follows)
- Mobile app
- Multi-page navigation
- Automated tests

## Architecture

### Two-folder setup

Two sibling folders under `/home/musyoka/personal/myProject/frank/`:

- **`download_music/`** — existing CLI. **Untouched.** Used as experimentation sandbox for scraping and scoring changes. Safe to break.
- **`download-music-web/`** — new Next.js web app. Contains its own copy of the pipeline. Deployed to Contabo.

**Change workflow for pipeline logic:** tweak in `download_music/` first, test via CLI, then manually port updated files into `download-music-web/lib/pipeline/`.

### Tech stack

- **Framework:** Next.js 15 (App Router, React Server Components)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Runtime:** Node.js (spawning yt-dlp/ffmpeg — not Edge)
- **Process manager:** PM2 (or systemd)
- **Reverse proxy:** Caddy (auto-HTTPS)
- **Host binaries required:** `yt-dlp`, `ffmpeg`, `spotdl`, Playwright browsers

### Folder layout

```
download-music-web/
├── app/
│   ├── layout.tsx                     ← root layout, dark theme, fonts
│   ├── page.tsx                       ← the single page
│   ├── globals.css                    ← tailwind + theme tokens
│   └── api/
│       ├── rank/route.ts              ← POST /api/rank
│       ├── download/route.ts          ← POST /api/download → {jobId}
│       ├── progress/[jobId]/route.ts  ← SSE stream
│       ├── audio/[file]/route.ts      ← streams MP3 with Range
│       ├── zip/[jobId]/route.ts       ← streams ZIP of a job's tracks
│       └── health/route.ts            ← deps + disk health
├── components/
│   ├── ui/                            ← shadcn primitives (Button, Dialog, Tabs, Toast, Progress…)
│   ├── hero.tsx
│   ├── value-props.tsx
│   ├── how-it-works-modal.tsx
│   ├── mode-selector.tsx              ← 4-tab mode switcher
│   ├── inputs/
│   │   ├── genre-input.tsx
│   │   ├── artist-input.tsx
│   │   ├── song-input.tsx
│   │   └── url-input.tsx
│   ├── results-list.tsx
│   ├── track-card.tsx
│   ├── audio-player.tsx               ← global player for preview streaming
│   ├── download-panel.tsx             ← sticky bottom-right
│   └── footer.tsx
├── lib/
│   ├── pipeline/
│   │   ├── scrapers/                  ← copied from src/scrapers/
│   │   │   ├── spotify.js
│   │   │   └── youtube.js
│   │   ├── scoring/                   ← copied from src/scoring/
│   │   │   ├── hitScore.js
│   │   │   └── diversity.js
│   │   ├── playlist/                  ← copied from src/playlist/
│   │   │   └── m3u.js
│   │   ├── config/                    ← copied from src/config/
│   │   │   ├── genres.js
│   │   │   └── constants.js
│   │   ├── utils/
│   │   │   ├── format.js              ← copied
│   │   │   └── deps.js                ← adapted: throws instead of process.exit
│   │   └── orchestrator.ts            ← NEW — replaces src/pipeline.js for web
│   ├── jobs.ts                        ← in-memory job tracker: id → {status, progress, tracks}
│   └── types.ts                       ← shared types: Track, Candidate, Job, ProgressEvent
├── public/
│   ├── hero-bg.jpg                    ← background image for hero
│   └── favicon.ico
├── music/                             ← MP3 downloads (gitignored)
├── playlists/                         ← generated M3U files (gitignored)
├── deploy/
│   ├── Caddyfile                      ← reverse proxy config
│   └── ecosystem.config.js            ← PM2 config (or music-web.service for systemd)
├── .env.example
├── .gitignore
├── next.config.js
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── components.json                    ← shadcn config
└── package.json
```

### Pipeline on the server

`lib/pipeline/orchestrator.ts` exposes four functions. Each returns structured data and emits progress via a callback (which API routes forward as SSE events):

- `rankGenre({ genre, limit, onProgress }) → Track[]`
- `rankArtist({ artist, limit, onProgress }) → Track[]`
- `rankSong({ song, onProgress }) → Track[]`
- `downloadTracks({ tracks, jobId, onProgress }) → { files: string[]; failures: Track[] }`

Differences from `src/pipeline.js`:
- **Returns data** instead of side-effect prints
- **Emits progress via callback**, not `console.log`
- **Throws** on unrecoverable errors, never `process.exit()`
- **No `log.*` calls** — replaced with structured progress events

The existing scrapers/scoring/playlist modules stay unchanged; only the orchestrator is rewritten.

### API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/rank` | POST | Body `{ mode, input, limit? }` → returns `{ jobId, candidates: Track[] }`. |
| `/api/download` | POST | Body `{ tracks, playlistName? }` → returns `{ jobId }`. Spawns background job. |
| `/api/progress/[jobId]` | GET | SSE stream of `{ stage, current, total, track, status }` until complete. |
| `/api/audio/[file]` | GET | Streams MP3 with HTTP Range support (scrub-capable). |
| `/api/zip/[jobId]` | GET | Streams a ZIP of a completed job's tracks via `archiver`. |
| `/api/health` | GET | `{ ytdlp: bool, ffmpeg: bool, spotdl: bool, diskFreeGb: number }`. |

Progress events during a ranking job follow the existing stages:
`scraping-spotify` → `enriching-youtube` → `scoring` → `complete`.

Progress events during a download job:
`downloading` with `current`/`total`, per-track status updates, final `complete` or `partial-failure`.

### Frontend — single page composition

Top to bottom:

1. **Hero** (`components/hero.tsx`)
   - Full-width. Background image (`public/hero-bg.jpg`) with dark overlay.
   - Title: "Music Downloader". Tagline: "Get the real hits. Any genre. Any artist. One click."
   - Buttons: **Get Started** (scrolls to app panel) + **How it works** (opens modal).
2. **Why use this?** (`components/value-props.tsx`) — 4 cards:
   - 🎯 Real hits, not filler
   - 🎧 320kbps MP3 with embedded art + metadata
   - 🆓 Free, no signup, no ads
   - 📀 USB-ready M3U playlists
3. **Main app panel**
   - `mode-selector.tsx`: tabs 🎵 Genre | 🎤 Artist | 🔍 Song | 🔗 URL
   - Mode-specific inputs from `components/inputs/*`
   - Primary button: "Rank & Preview" (Genre/Artist/Song) or "Download" (URL)
4. **Status area** — visible during backend work. Progress strip showing current stage.
5. **Results list** (`components/results-list.tsx`)
   - Bulk actions: **Download All as ZIP** + **Download All as M3U**
   - Grid of `track-card.tsx`: thumbnail, title, artist, duration, views, score, ▶ Play, ⬇ Download
   - Clicking ▶ Play sends the track to a global `audio-player.tsx`
6. **Download panel** (`components/download-panel.tsx`)
   - Sticky bottom-right toast-style panel
   - Active downloads with per-track progress bars
   - Completed items with green check
   - Failed items with retry button
   - Minimise/expand control
7. **Footer** — GitHub link, version, credits.

### "How it works" modal

shadcn Dialog. 6 steps with icons:

1. Pick your mode
2. We scan the web (Spotify + YouTube)
3. Smart ranking (playlist appearances, views, recency)
4. Diversity cap (max 2 songs per artist in genre mode)
5. Preview & download
6. Get MP3s + M3U playlist

Close via button or outside-click.

### Aesthetic

- Background: `bg-zinc-950` / near-black
- Accent: neon green (`emerald-400`/`emerald-500`)
- Typography: Inter (or Geist), bold headings, comfortable body size
- Thumbnail-heavy cards
- Hover: subtle scale + glow
- Mobile-responsive but desktop-first

## Error handling

- **Scraping failure** — show toast, stay on page. Existing fallback chain (Spotify → YouTube Music search) preserved.
- **Download failure** — mark track failed in download panel; retry button re-queues it.
- **Empty results** — empty state with "try a different input" message.
- **Missing system deps** — `/api/health` returns status on load; persistent red banner if `yt-dlp`/`ffmpeg` absent.
- **Disk full** — surfaced via `/api/health`; banner warning above 90% usage.

## Deployment

### Host setup (one-time)

```bash
apt install -y ffmpeg python3-pip
pip install yt-dlp spotdl
# Node.js 20+ via nvm or nodesource
```

### App setup

```bash
cd /srv/download-music-web
npm ci
npx playwright install chromium
npm run build
pm2 start deploy/ecosystem.config.js
```

### Caddyfile

```
music.example.com {
  reverse_proxy localhost:3000
}
```

### File storage

- `music/` and `playlists/` live inside the project directory (gitignored)
- No cleanup cron in v1 — files accumulate
- `/api/health` surfaces disk usage; v2 can add retention

### Environment variables

- `PORT` (default 3000)
- `MUSIC_DIR` (default `./music`)
- `PLAYLISTS_DIR` (default `./playlists`)

## Testing

Manual smoke test after each stage. No automated tests in v1. Happy-path checks:

- Each mode returns ranked results
- `<audio>` preview streams and scrubs via Range headers
- Individual download, ZIP download, M3U download all work
- SSE progress emits during ranking and downloading
- Refreshing mid-download does not corrupt server state

## Implementation sequencing (preview for the plan)

1. Scaffold Next.js + TS + Tailwind + shadcn in `download-music-web/`
2. Copy pipeline code (`scrapers/`, `scoring/`, `playlist/`, `config/`, `utils/format.js`), adapt `utils/deps.js`
3. Write `lib/pipeline/orchestrator.ts`, `lib/jobs.ts`, `lib/types.ts`
4. API routes (`/api/health`, `/api/rank`, `/api/download`, `/api/progress`, `/api/audio`, `/api/zip`)
5. Root layout + globals (dark theme, fonts, tokens)
6. `hero`, `value-props`, `how-it-works-modal`
7. `mode-selector` + 4 input components
8. `results-list`, `track-card`, `audio-player`
9. `download-panel` with SSE wiring
10. Polish pass: hover states, transitions, mobile breakpoints
11. Deployment config: `Caddyfile`, `ecosystem.config.js`, `.env.example`, README deploy steps
12. Local smoke test → deploy to Contabo → remote smoke test

Detailed plan to be written via `superpowers:writing-plans`.
