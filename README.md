# Wax

> Real hits, properly pressed.

A self-hosted music discovery and download tool. Search by genre, artist, song, or paste a YouTube URL — preview every track in your browser, then download the ones you want as 320 kbps MP3s.

No signup. No ads. No tracking. One Node process, anonymous cookie sessions.

## What it does

Four modes:

- **Genre** — discover the current top tracks for a genre (afrobeats, amapiano, hip-hop, anything you type). LLM expands your input into 5–8 diverse YouTube Music search queries, scrapes the union, scores by playlist position + view count + recency, runs an LLM keep/reject classifier to drop covers / mixes / remixes / fan reuploads, returns the top N.
- **Artist** — top tracks for a specific artist using the same scoring and classification pipeline.
- **Song** — find a specific song by title and artist.
- **URL** — paste a YouTube link, get a clean MP3.

Click ▶ on any result to preview the audio in-browser (streamed from YouTube via yt-dlp's signed URL). Click ↓ to download a single track, or ZIP / M3U the whole result set.

## Stack

- **Next.js 15** App Router, React 19, TypeScript
- **Tailwind** + shadcn/ui primitives
- **OpenAI** (`gpt-4o-mini`) for query understanding and candidate classification
- **Playwright** (headless Chromium) to scrape YouTube Music search
- **yt-dlp** for video resolution, audio download, upload-date enrichment
- **ffmpeg** for audio extraction and 320 kbps MP3 transcoding
- **spotdl** as an alternative download path
- **Pino** for structured server logs
- **Zod** for LLM response validation

Anonymous sessions via `dm_session` cookie (HttpOnly, 30 days). Job state lives in process memory (hoisted on `globalThis` so HMR doesn't lose it). No database.

## Prerequisites

System binaries on PATH:

```bash
yt-dlp     # https://github.com/yt-dlp/yt-dlp
ffmpeg     # https://ffmpeg.org/
spotdl     # pip install spotdl  (optional fallback)
```

Node.js 20+ and npm. Chromium is provisioned by Playwright.

OpenAI API key. The app works without one (LLM steps degrade to scrape + manual ranking) but quality is much better with it.

## Quick start

```bash
git clone https://github.com/francis-musyoka/download-music-wed
cd download-music-web
npm install
npx playwright install chromium

cp .env.example .env
# edit .env — set OPENAI_API_KEY at minimum

npm run dev           # http://localhost:3000
```

Other commands:

```bash
npm run build         # production build
npm run start         # serve the production build
npm run typecheck     # tsc --noEmit
npm test              # vitest run
npm run test:watch    # vitest watch
npm run eval          # search-quality eval script (scripts/eval-search.ts)
npm run lint          # next lint
```

## Configuration

`.env` — see `.env.example` for the full list:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Dev/prod listening port |
| `MUSIC_DIR` | `./music` | Where downloaded MP3s land |
| `PLAYLISTS_DIR` | `./playlists` | Where M3U files land |
| `OPENAI_API_KEY` | _empty_ | Required for LLM features |
| `OPENAI_ENABLED` | `false` | Set to `true` to enable LLM hooks. Auto-disabled when key is empty. |
| `OPENAI_MODEL_FAST` | `gpt-4o-mini` | Used for query understanding |
| `OPENAI_MODEL_RERANK` | `gpt-4o-mini` | Used for candidate classifier |
| `OPENAI_MODEL_SMART` | `gpt-4o` | Reserved for A/B; not currently in the hot path |
| `OPENAI_TIMEOUT_UNDERSTAND_MS` | `5000` | Per-call timeout for understand |
| `OPENAI_TIMEOUT_RERANK_MS` | `15000` | Per-call timeout for classifier |
| `OPENAI_BASE_URL` | _empty_ | Override for local test fakes; leave empty in prod |
| `SPOTIFY_CLIENT_ID`       | _empty_           | Required for Spotify integration |
| `SPOTIFY_CLIENT_SECRET`   | _empty_           | Required for Spotify integration |
| `SPOTIFY_MIN_RESULTS`     | `3`               | Below this, Spotify path falls back to YT Music |
| `DAILY_OVERALL_LIMIT`     | `150`             | Overall daily search ceiling (abuse backstop) |
| `SCRAPE_CONCURRENCY` | `3` | Parallel YouTube Music tabs per scrape |

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │                  app/page.tsx                │
                    │  (single-page UI, SSE subscription, dock)    │
                    └──┬───────────────────────┬───────────────────┘
                       │                       │
                       │ POST                  │ GET (SSE)
                       ▼                       ▼
              ┌────────────────────┐ ┌────────────────────┐
              │ /api/rank          │ │ /api/progress/[id] │
              │ /api/download      │ │ (SSE stream)       │
              │ /api/preview/[id]  │ └────────────────────┘
              │ /api/audio/[file]  │
              │ /api/zip/[id]      │
              │ /api/quota         │
              │ /api/health        │
              └─────────┬──────────┘
                        │
                        ▼
              ┌────────────────────────────────────────┐
              │ lib/pipeline/orchestrator.ts            │
              │  rankGenre / rankArtist / rankSong      │
              │  downloadTracks / downloadByUrl         │
              └─────────┬──────────────────────────────┘
                        │
       ┌────────────────┼────────────────┬──────────────┐
       │                │                │              │
       ▼                ▼                ▼              ▼
┌──────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐
│ scrapers/    │ │ enrich/     │ │ scoring/    │ │ llm/       │
│ spotify.js   │ │ uploadDates │ │ hitScore    │ │ understand │
│ youtube.js   │ │             │ │ noiseFilter │ │ classify   │
│              │ │             │ │ diversity   │ │            │
└──────────────┘ └─────────────┘ └─────────────┘ └────────────┘
   Playwright    yt-dlp metadata   pure logic     OpenAI API
```

### The genre/artist pipeline (the meat)

1. **LLM understand** (`lib/llm/understandQuery.ts`) — normalizes the user's input. For genre, returns 5–8 diverse search terms across era, scene/subgenre, geography, mood, artist-anchored, and language axes.
2. **Scrape** (`lib/pipeline/scrapers/spotify.js`) — runs each search term against YouTube Music, parses the song rows, deduplicates by `(artist, title)`. Up to 10 queries per call.
3. **Enrich + dates** (`lib/pipeline/enrich/uploadDates.ts`) — yt-dlp call per candidate to fetch upload date for recency scoring. Concurrent.
4. **Wide regex noise filter** (`lib/pipeline/scoring/noiseFilter.ts`) — drops mixes, live, karaoke, remix, sped-up, reaction, anything outside 2–8 minutes.
5. **Library dedupe** — drops candidates that already exist in `MUSIC_DIR`.
6. **hitScore** (`lib/pipeline/scoring/hitScore.js`) — sorts by `playlistCount × bestPosition × views × recency`.
7. **Top-100 cap** — only the top 100 by hitScore go to the LLM (cost ceiling).
8. **LLM classifier** (`lib/llm/rerankCandidates.ts`) — keep/reject decision per candidate with category (cover, wrong-artist, mix, low-quality-upload, etc.). No scoring; manual hitScore is the final ranker.
9. **Diversity cap** (genre only) — max 2 tracks per artist.
10. **Slice to N** — return what the user asked for. Surface a "only N high-confidence tracks found" note when the pool runs short.

When Spotify credentials are configured, the orchestrator queries the Spotify Web API first and falls back to YouTube Music scraping when results are thin. Either path produces the same `Track` shape; the YouTube-match step turns Spotify catalog metadata into downloadable YouTube videos. The fallback is silent — users see new tracks on repeat searches via per-session `seenTracks` (also seeds a future "library" feature).

### Rate limits

`lib/limits.ts`:

- **5/min per IP** for genre + artist (heavy modes — Playwright + LLM batch)
- **10/min per IP** for song + URL (light)
- **12/day per session** for genre + artist (resets at UTC midnight)
- **4 concurrent jobs globally** (`reserveSlot`)

The session cookie identifies the user; the per-IP bucket is the secondary ratchet. Validation runs before any rate-limit increment, so typo'd POSTs don't burn quota.

`/api/quota` returns the current session's daily budget. The UI shows "X of 12 used today" inline.

### Cost ceiling

At full daily saturation, 100 active users × 12 searches/day × ~$0.002/query ≈ **$2.40/day**. Caching brings real-world cost well below this.

### Security invariants

Documented in `.claude/skills/reviewing-pull-requests/SKILL.md` for review automation, but worth stating here:

- All child-process calls use the **argv-array form** of `execFile`. No shell, no string templating, no injection surface.
- `/api/audio/[file]` is path-traversal-guarded via `path.basename` + containment check against `MUSIC_DIR_RESOLVED`.
- `/api/download` enforces an HTTPS allowlist (`youtube.com`, `youtu.be`) on both `body.url` and every `body.tracks[i].videoUrl`.
- `/api/progress/[jobId]` and `/api/zip/[jobId]` compare the `dm_session` cookie to `job.sessionId` and return 404 (not 403) on mismatch.
- `/api/preview/[videoId]` enforces a strict `^[a-zA-Z0-9_-]{11}$` regex and a per-IP rate limit.
- The 11-char videoId regex is at the boundary; we don't trust yt-dlp to validate.

## Repository layout

```
app/                  Next.js routes (UI + API)
  page.tsx              single-page UI
  api/                  health, rank, download, audio, preview, progress, zip, quota
components/           React components (Nav, Hero, AppPanel, ResultsList, AudioPlayer, …)
lib/
  pipeline/             orchestrator + scrapers + scoring + enrich
  llm/                  OpenAI client, prompts, schemas, caches
  jobs.ts               in-memory job store + SSE emit/subscribe
  limits.ts             rate buckets + slot accounting
  session.ts            anonymous cookie session
  sanitize.ts           safe filename helper
  types.ts              shared types
e2e/                  Playwright specs
docs/superpowers/     plans + design docs
deploy/               Caddyfile, PM2 ecosystem, deploy README
scripts/              eval + token-counting tools
```

The pipeline modules under `lib/pipeline/**` are intentionally CommonJS (`.js`) because they were ported byte-for-byte from a CLI ancestor. Don't convert them — TypeScript may suggest the conversion, but it's a known false positive.

Internal identifiers (`dm_session` cookie, `__downloadMusic*` globalThis keys, `download-music-web` package name) keep the original short prefix for backwards compatibility with the existing data directory and PM2 process. They don't need to change with the brand.

## Deploying to Contabo (or any Node host)

See [`deploy/README.md`](deploy/README.md) for the full one-time setup. Short version:

```bash
# on the box
sudo apt install -y ffmpeg python3-pip caddy
sudo pip install yt-dlp spotdl
npm i -g pm2

# in your checkout
npm ci --omit=dev
npx playwright install chromium --with-deps
npm run build

# point Caddyfile at your domain, then:
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl restart caddy
pm2 start deploy/ecosystem.config.js
pm2 save && pm2 startup
```

Logs: `pm2 logs <process-name>` (defaults to whatever `name` is set to in `deploy/ecosystem.config.js`). Upgrade: `git pull && npm ci --omit=dev && npm run build && pm2 reload <process-name>`.

## Development notes

- **Dev HMR and in-memory state.** Several modules use `globalThis.__downloadMusic*` to keep their state across HMR module re-evaluation: `lib/jobs.ts` (jobs), `lib/limits.ts` (rate buckets + slots), `app/api/preview/[videoId]/route.ts` (preview cache), `lib/llm/understandCache.ts` (LLM result cache). Process restart is the only thing that clears them.
- **Cache invalidation in dev.** If you edit a prompt and want to retry a previously-rejected query, restart the dev server. The `understandCache` does not memoize rejections, but successful resolutions persist until process exit.
- **Playwright on dev machines.** First run after `npm install` needs `npx playwright install chromium` — Playwright doesn't auto-fetch browsers unless told to.
- **Tests.** `lib/llm/__tests__/` and `lib/pipeline/__tests__/` use Node's built-in test runner with `--experimental-strip-types`. No Jest, no Vitest. End-to-end smoke is Playwright in `e2e/`.
- **Pre-existing branch state.** This repo's main branches carry several uncommitted experiments (LLM caching iterations, scoring tweaks). Use `git status` to see what's tracked vs in-flight; commit selectively rather than `git add -A`.

## License

MIT.
