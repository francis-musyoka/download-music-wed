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
│   ├── nav.tsx
│   ├── hero.tsx
│   ├── marquee.tsx
│   ├── value-props.tsx
│   ├── how-to-download.tsx            ← 4-step illustrated guide (new)
│   ├── how-it-works-modal.tsx         ← 6-step algorithm modal
│   ├── app-panel.tsx                  ← console container with tabs + forms + status
│   ├── steps-inline.tsx               ← colored 3-step pills inside app panel
│   ├── inputs/
│   │   ├── genre-input.tsx
│   │   ├── artist-input.tsx
│   │   ├── song-input.tsx
│   │   └── url-input.tsx
│   ├── dropdown.tsx                   ← custom non-native dropdown (shadcn Select wraps Radix)
│   ├── results-list.tsx
│   ├── track-card.tsx
│   ├── audio-player.tsx               ← global player for preview streaming
│   ├── download-dock.tsx              ← draggable bottom-right dock
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

Top to bottom (user-tested with three reviewers; copy simplified to plain action verbs — "search / preview / download" — after they found the original "queue your chart" editorial framing confusing):

1. **Nav** — brand wordmark "Musicography." with tangerine full-stop + links: Why, Start, How it works. No GitHub link per user decision.
2. **Hero** (`components/hero.tsx`)
   - Full-viewport section. Layered radial gradients + subtle CSS grid lines + grain overlay (no photo background — atmospheric only).
   - Title: editorial display type "The **Real Hits.** Downloaded." (italic accent on "Real Hits.")
   - Sub: "Search by genre, artist, song name, or paste a link. Preview every track in your browser first, then download the ones you love as 320kbps MP3s. No signup. No ads."
   - Buttons: **Start searching →** (primary tangerine) + **How it works** (ghost, opens modal)
   - Right rail: "Edition 001" marker in editorial mono type
   - Scrolling marquee at section bottom showing current hit tickers
3. **Why use this?** (`components/value-props.tsx`) — 3 asymmetric cards:
   - 01 / DETECTION — Real hits, not filler
   - 02 / FIDELITY — 320kbps with proper metadata
   - 03 / LICENCE — No signup. No ads. No tracking.
4. **How to download** (`components/how-to-download.tsx`) — NEW section. 4 illustrated step cards with oversized alternating tangerine/lime number badges floating above each card. Each card contains a mini-illustration of what that step shows:
   - Step 1: mini mode-tabs (Genre highlighted) — "Choose how to search"
   - Step 2: mini ranked chart rows with score badges — "Get ranked results"
   - Step 3: ▶ button + animated waveform — "Preview in your browser"
   - Step 4: 3 download-option chips (Single / ZIP / M3U) — "Download what you love"
   - Bottom CTA: "Try it now ↓" links to app panel
5. **Main app panel** (`components/app-panel.tsx` + subcomponents)
   - Heading: "Find your **music.**" + inline 3-step pill stack ("Search / Preview / Download") with colored number chips
   - Console-style container with 4 tabs (`./GENRE` `./ARTIST` `./SONG` `./URL`) using monospace labels
   - Mode-specific form panels (only the active one visible, toggled via `hidden` attr):
     - Genre: custom dropdown + limit + playlist name
     - Artist: artist input (full width) + limit + playlist name
     - Song: single song-title input (centered, full width)
     - URL: URL input (full width) + playlist name
   - Primary button label changes per mode:
     - Genre/Artist → **Search top tracks →**
     - Song → **Search this song →**
     - URL → **Download now →**
   - Status log below the form (hidden until triggered) — terminal-style `>` lines with ✓/▸/○ markers per stage
6. **Results list** (`components/results-list.tsx`) — rendered after ranking completes
   - Eyebrow: `Search results · <input> · <N> tracks`
   - Heading: "Preview and **download.**"
   - Helper copy explicitly explains the ▶ and ↓ icons and the bulk options
   - Bulk buttons: **↓ Download all (ZIP)** + **↓ Download playlist (M3U)**
   - Rows with Billboard-chart-style oversized rank number (01, 02…) + move indicator (▲▼ NEW), thumbnail, title, artist, duration, plays, score pill (acid lime), ▶/↓ icon buttons
7. **Download dock** (`components/download-dock.tsx`)
   - Floating panel (default bottom-right) with brutalist offset shadow
   - **Draggable by the header** — pointer events with viewport clamping; does not trigger drag on close button
   - Shows: `Transfer live · N/M` live indicator, three-line grip hint, active/done/failed items with spinning-vinyl / green-tick / retry states
   - Minimise control
8. **Footer** — "Side A / Side B / Catalog" record-sleeve styled columns; bottom line with copyright + version.

### "How it works" modal

shadcn Dialog. 6 steps with icons:

1. Pick your mode
2. We scan the web (Spotify + YouTube)
3. Smart ranking (playlist appearances, views, recency)
4. Diversity cap (max 2 songs per artist in genre mode)
5. Preview & download
6. Get MP3s + M3U playlist

Close via button or outside-click.

### Aesthetic — "Editorial Billboard Chart meets Analog Warmth"

Direction committed after building and reviewing a working HTML prototype at `design/prototype.html`. The aesthetic positions the product as an authoritative music critic's chart — not a generic streaming clone — with pops of energetic color to keep it feeling alive. See the prototype for the source of truth; the tokens below are the extraction.

**Palette**
- `--bg`: `#0c0a09` — warm near-black (vinyl sleeve under low light)
- `--bg-2`: `#171310` — elevated surface
- `--fg`: `#fafaf9` — warm off-white (aged paper, not sterile white)
- `--fg-dim`: `#a8a29e` — secondary text
- `--fg-muted`: `#57534e` — tertiary/placeholder
- `--accent`: `#FF5A1F` — electric tangerine (primary CTAs, emphasis)
- `--accent-2`: `#C1FF00` — acid lime (secondary pops, scores, "live" indicators)
- `--line`: `#2a2522` — subtle divider
- `--line-bright`: `#44403c` — stronger border

**Typography (all Google Fonts, free)**
- Display: **Fraunces** (variable axes: `opsz 9–144`, `SOFT 0–100`, `WONK 0–1`) — characterful editorial serif used at large sizes with italics in the accent color
- Body: **Plus Jakarta Sans** (400/500/600/700/800) — modern geometric sans for paragraphs and UI
- Mono: **JetBrains Mono** (300/400/500/700) — rank numbers, durations, status logs, eyebrow labels

**Interaction patterns**
- Buttons use a **brutalist offset shadow** (`5px 5px 0 var(--accent)`) that translates on hover — no soft drop shadows
- Hover states lift cards `translateY(-8px)` and swap border to accent
- All native `<select>` elements are replaced with a **custom `<div>`-based dropdown** (`.dropdown` + `.dropdown__panel` + `.dropdown__option` buttons) for full styling control of the popover
- The download dock is **draggable** — pointer events, clamped to viewport, works on touch
- Micro-animations: pulsing live dot, scrolling marquee, animated waveform bars in step-3 icon, spinning vinyl in dock items

**Visual accents baked in**
- Grain overlay (SVG fractal noise) for printed-paper atmosphere
- Subtle radial-gradient wash in hero and "how" sections
- Faint CSS grid lines behind hero
- Dashed border on step-icon mock boxes (editorial/schematic feel)
- Number chips with `4px 4px 0 var(--fg)` offset shadows on the "how to download" section
- Alternating tangerine/lime on step numbers for rhythmic color pulses

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

## Design prototype

A fully working HTML prototype of the complete visual design lives at:

```
design/prototype.html
```

It is the **visual source of truth** for the implementation — includes palette, typography, all 8 page sections, working tabs + custom dropdown + draggable dock + modal, and every micro-interaction. Open it locally:

```bash
cd download-music-web/design
python3 -m http.server 8765
# open http://localhost:8765/prototype.html
```

Implementation components should port this design faithfully to React + Tailwind, not reinterpret it.

## Implementation sequencing (preview for the plan)

1. Scaffold Next.js 15 + TS + Tailwind + shadcn/ui in `download-music-web/`
2. Port palette + typography from prototype → `tailwind.config.ts` + `globals.css` (CSS variables, Google Fonts for Fraunces + Plus Jakarta Sans + JetBrains Mono)
3. Copy pipeline code (`scrapers/`, `scoring/`, `playlist/`, `config/`, `utils/format.js`), adapt `utils/deps.js`
4. Write `lib/pipeline/orchestrator.ts`, `lib/jobs.ts`, `lib/types.ts`
5. API routes: `/api/health`, `/api/rank`, `/api/download`, `/api/progress/[jobId]`, `/api/audio/[file]`, `/api/zip/[jobId]`
6. Root layout + globals — dark theme, grain overlay, variable-font setup
7. `Nav`, `Hero`, `Marquee`, `ValueProps`
8. `HowToDownload` (4 step cards with mini-illustrations)
9. `HowItWorksModal` (6-step algorithm dialog)
10. `AppPanel` shell + `StepsInline` + 4 `Input*` subcomponents + custom `Dropdown` (or shadcn Select)
11. Status log component wired to SSE progress events
12. `ResultsList` + `TrackCard` + `AudioPlayer` (global, streams via `/api/audio/:file`)
13. `DownloadDock` — draggable with pointer events, viewport clamping, SSE-driven item state
14. Footer
15. Responsive polish pass (tablet + mobile breakpoints from prototype)
16. Deployment config: `Caddyfile`, `ecosystem.config.js`, `.env.example`, `README` deploy steps
17. Local smoke test (all 4 modes, preview streaming, individual + ZIP + M3U download, dock drag) → deploy to Contabo → remote smoke test

Detailed plan to be written via `superpowers:writing-plans`.
