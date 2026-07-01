# WaxMusic

> Real hits, properly pressed.

A self-hosted music discovery and download tool. Search by genre, artist, song, or paste a YouTube URL — preview every track in your browser, then download the ones you want as 320 kbps MP3s.

No signup. No ads. No tracking. One Node process, anonymous cookie sessions.

## What it does

Four modes:

- **Genre** — top tracks for a genre (afrobeats, amapiano, hip-hop, anything you type). Three parallel ytmusicapi searches per query — bare, `+hits`, and `+new` — return ~400 raw candidates; the `+new` results are tagged for a hit-score boost so fresh material can compete with classics. Then noise filter, dedupe, hit-score rank, LLM rerank on the top 50, diversity cap.
- **Artist** — top tracks for a specific artist using strict primary-artist matching (features where someone else is primary get dropped) with a Levenshtein fuzzy fallback so misspelled names still resolve.
- **Song** — find a specific song by title and artist. Two parallel searches: an `"artist title"` lookup whose best title-match (also fuzzy) gets pinned at position 1, plus an artist-only query filling four more slots.
- **URL** — paste a YouTube link, get a clean MP3.

Click ▶ on any result to preview the audio in-browser (streamed from YouTube via yt-dlp's signed URL). Click ↓ to download a single track, or ZIP / M3U the whole result set.

## Stack

- **Next.js 15** App Router, React 19, TypeScript
- **Tailwind** + shadcn/ui primitives
- **OpenAI** (`gpt-4o-mini`) for genre-mode candidate rerank
- **ytmusicapi** (Python sidecar) for InnerTube API searches — replaces the old Playwright scrape
- **yt-dlp** for video resolution and audio download
- **Deno** as yt-dlp's JavaScript runtime for solving YouTube's signature/n-param challenges
- **ffmpeg** for audio extraction and 320 kbps MP3 transcoding
- **spotdl** as an alternative download path
- **Pino** for structured server logs
- **Zod** for LLM response validation
- **Vitest** for unit tests

Anonymous sessions via `dm_session` cookie (HttpOnly, 30 days). Job state lives in process memory (hoisted on `globalThis` so HMR doesn't lose it). No database.

## Prerequisites

System binaries on PATH:

```bash
yt-dlp     # pipx install yt-dlp
ffmpeg     # apt install ffmpeg
deno       # curl -fsSL https://deno.land/install.sh | sh
spotdl     # pipx install spotdl  (optional)
```

Node.js 22+ and npm. Python 3 (used only to run the ytmusicapi sidecar from a project-local venv — set up in two commands below).

OpenAI API key. The app works without one (LLM rerank degrades and the top-N comes purely from hit-score) but quality is noticeably better with it on.

A `cookies.txt` file exported from a logged-in YouTube account — required on datacenter IPs to avoid the "Sign in to confirm you're not a bot" bot wall. See [`lib/cron/REFRESH-COOKIES.md`](lib/cron/REFRESH-COOKIES.md) for the export workflow (uses a browser extension to avoid Chrome's App-Bound Encryption rotation).

## Quick start

```bash
git clone https://github.com/francis-musyoka/download-music-wed
cd download-music-web
npm install

# Python sidecar for ytmusicapi (search engine)
python3 -m venv .venv-ytmusic
.venv-ytmusic/bin/pip install -r requirements-ytmusicapi.txt

cp .env.example .env
# edit .env — set OPENAI_API_KEY, YTMUSIC_PYTHON, YT_DLP_COOKIES at minimum

npm run dev           # http://localhost:3000
```

Other commands:

```bash
npm run build         # production build
npm run start         # serve the production build
npm run typecheck     # tsc --noEmit
npm test              # vitest run — lib/**/__tests__/*.test.ts
npm run test:watch    # vitest watch mode
npm run eval          # search-quality eval script (scripts/eval-search.ts, gitignored)
npm run lint          # next lint
```

## Configuration

`.env` — see `.env.example` for the full list:

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Listening port (dev/prod) |
| `MUSIC_DIR` | `./music` | Where downloaded MP3s land |
| `PLAYLISTS_DIR` | `./playlists` | Where M3U files land |
| `OPENAI_API_KEY` | _empty_ | Required for LLM rerank (genre mode) |
| `OPENAI_ENABLED` | `false` | Set to `true` to enable LLM rerank. Auto-disabled when key is empty. |
| `OPENAI_MODEL_RERANK` | `gpt-4o-mini` | Model used for candidate rerank |
| `OPENAI_TIMEOUT_RERANK_MS` | `15000` | Per-call timeout |
| `YTMUSIC_PYTHON` | _empty_ | Path to a Python with `ytmusicapi` installed (the venv's `python3`). Unset → falls back to `python3` on PATH (likely fails). |
| `YT_DLP_COOKIES` | _empty_ | Path to a Netscape-format cookies file. Required on datacenter IPs for downloads to bypass bot detection. |
| `COOKIE_ALERT_WEBHOOK` | _empty_ | Discord/Slack webhook URL. When set, the 6-hourly health check at `lib/cron/check-cookies.sh` posts here if the cookies have expired. |
| `CLEANUP_MAX_AGE_DAYS` | `7` | Files in `MUSIC_DIR` / `PLAYLISTS_DIR` older than this get swept |
| `CLEANUP_INTERVAL_HOURS` | `6` | How often the in-process cleanup sweeper runs |
| `YT_DLP_PREVIEW_TIMEOUT_MS` | `60000` | Per-call timeout for `/api/preview/[videoId]` |

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
│ scrapers/    │ │ utils/      │ │ scoring/    │ │ llm/       │
│ ytmusic-api  │ │ title-match │ │ hitScore    │ │ rerank     │
│ youtube.js   │ │             │ │ noiseFilter │ │ (genre     │
│              │ │             │ │ diversity   │ │  mode only)│
└──────────────┘ └─────────────┘ └─────────────┘ └────────────┘
  Python sidecar    pure logic     pure logic     OpenAI API
  + yt-dlp
```

The Python sidecar is a tiny CLI (`lib/pipeline/scrapers/ytmusic_search.py`) that shells out from `lib/pipeline/scrapers/ytmusic-api.js` via argv-array `execFile`. It calls `ytmusicapi.YTMusic().search(...)` with `ignore_spelling=False` (YTM's autocorrect is on by default) and prints JSON to stdout.

**Download API reference:** the endpoint contracts (`/api/download`, `/api/progress`, `/api/audio`, `/api/zip`), request/response shapes, validation rules, the yt-dlp flow, and a "build your own" pattern are documented in [`docs/download-api.md`](docs/download-api.md) ([web version](https://gist.github.com/francis-musyoka/408f287a85ae96f505b273c2030c6e2a)).

### The genre pipeline (the meat)

1. **Three parallel searches** (`lib/pipeline/scrapers/ytmusic-api.js`) — `q`, `q + " hits"`, `q + " new"`, each with `limit=200`. Results merged by videoId; tracks surfaced by the `+new` query are tagged `inNewPool=true`. Typically ~400 unique candidates.
2. **Noise filter** (`lib/pipeline/scoring/noiseFilter.ts`) — drops mixes, mixtapes, megamixes, "continuous mix", "full album", live, karaoke, remixes, sped-up/slowed, reactions, anything outside 60–600 s.
3. **Library dedupe** — drops candidates that already exist in `MUSIC_DIR`.
4. **Hit-score** (`lib/pipeline/scoring/hitScore.js`) — sorts by `log10(views)` plus a bucketed additive boost for `inNewPool=true` tracks (`+0.3` for <100K views, scaling up to `+1.8` for ≥10M views). The boost lets a new release with 5M views just edge past an old 100M-view classic, but a new 20K-view upload still can't outrank a real hit.
5. **Title-artist dedupe** — walk the ranked list, keep only the first occurrence of each `(normalised title, normalised artist)` pair. Stops twin YT Music uploads from taking adjacent slots.
6. **Top-50 cap** — only the top 50 by hit-score go to the LLM (cost ceiling).
7. **LLM rerank** (`lib/llm/rerankCandidates.ts`) — `gpt-4o-mini` keep/reject per candidate. Input is just `{id, artist, title}`. Degrade path: top 10 by hit-score if the LLM call fails.
8. **Diversity cap** (`lib/pipeline/scoring/diversity.js`) — max 2 tracks per artist.
9. **Slice to N** — return what the user asked for. Surface a "only N high-confidence tracks found" note when the pool runs short.

Artist mode is steps 2–4 + slice (no LLM rerank, no diversity cap), with a **strict primary-artist filter** added before the noise filter — Levenshtein-fuzzy so `Burna Boi` still resolves to Burna Boy. Song mode is two parallel searches with a title-match pin (also fuzzy) that guarantees the exact track at position 1 when present.

### Rate limits

`lib/limits.ts`:

- **5/min per IP** for genre + artist
- **10/min per IP** for song + URL
- **150/day per session overall** + **12/day per session for "expensive" calls** (those that actually fire the LLM rerank)
- **4 concurrent jobs globally** (`reserveSlot`)

The session cookie identifies the user; the per-IP bucket is the secondary ratchet. Validation runs before any rate-limit increment.

`/api/quota` returns both tiers; the UI shows the relevant one inline.

### Diagnostic logging

Every search emits one structured log line at completion (`pino` JSON):

```json
{"module":"pipeline","mode":"genre","query":"afrobeats","raw":435,"afterNoise":299,"toLlm":50,"afterRerank":32,"afterDiversity":23,"final":10,"searchMs":7999,"rerankMs":13851,"totalMs":21851}
```

Useful for understanding production behaviour at a glance — grep `pm2 logs wax` for `rank-complete` (or just the per-stage numbers).

### Security invariants

Documented in `.claude/skills/reviewing-pull-requests/SKILL.md` for review automation:

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
  cron/                 /etc/cron.d/ unit + scripts (weekly upgrades, cookie health check)
  pipeline/             orchestrator + scrapers + scoring + utils
    scrapers/             ytmusic-api.js (Node wrapper) + ytmusic_search.py (sidecar) + youtube.js (yt-dlp)
    scoring/              hitScore, noiseFilter, diversity
    utils/                title-match (Levenshtein-fuzzy)
  llm/                  OpenAI client, rerank prompt, schemas
  jobs.ts               in-memory job store + SSE emit/subscribe
  limits.ts             rate buckets + slot accounting
  session.ts            anonymous cookie session
  sanitize.ts           safe filename helper
  types.ts              shared types
docs/superpowers/     plans + design docs (gitignored scratchpad)
deploy/               Caddyfile, PM2 ecosystem, deploy README (gitignored)
scripts/              eval + diagnostic tools (gitignored)
```

The pipeline `.js` files under `lib/pipeline/**` are intentionally CommonJS — they were ported byte-for-byte from a CLI ancestor and the Node wrapper / orchestrator interop with them via `require()`. Don't convert; the LSP will suggest it, but the suggestion is a known false positive.

Internal identifiers (`dm_session` cookie, `__downloadMusic*` globalThis keys, `download-music-web` package name) keep the original short prefix for backwards compatibility with the existing data directory and PM2 process. They don't need to change with the brand.

## Deploying to Contabo (or any Node host)

```bash
# On the box — one-time
sudo apt install -y ffmpeg python3-venv python3-pip pipx caddy
pipx ensurepath && pipx install yt-dlp && pipx install spotdl
curl -fsSL https://deno.land/install.sh | sh
sudo ln -sf /root/.deno/bin/deno /usr/local/bin/deno
npm i -g pm2

# In the checkout
npm ci
python3 -m venv .venv-ytmusic
.venv-ytmusic/bin/pip install -r requirements-ytmusicapi.txt
npm run build

# Point Caddyfile at your domain, then:
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl restart caddy
pm2 start deploy/ecosystem.config.js
pm2 save && pm2 startup

# Install the maintenance crons (weekly upgrades + 6h cookie health check)
sudo install -m 644 lib/cron/wax.cron /etc/cron.d/wax
sudo mkdir -p /var/log/wax
```

`.env` on the VPS needs (at minimum): `OPENAI_API_KEY`, `OPENAI_ENABLED=true`, `YTMUSIC_PYTHON=/var/www/download-music-wed/.venv-ytmusic/bin/python3`, `YT_DLP_COOKIES=/var/www/download-music-wed/cookies.txt`, and ideally `COOKIE_ALERT_WEBHOOK` (Discord/Slack URL — pings you when cookies expire).

Ship cookies separately — they're not in git. See [`lib/cron/REFRESH-COOKIES.md`](lib/cron/REFRESH-COOKIES.md) for the workflow.

Logs: `pm2 logs wax`. Cron logs: `/var/log/wax/{pipx-upgrade,ytmusicapi-upgrade,check-cookies}.log`.

Upgrade: `git pull && npm ci && npm run build && pm2 restart wax`. The venv, cron, and `.env` are gitignored so they survive across deploys; the cron auto-upgrades `yt-dlp` + `ytmusicapi` weekly so YouTube changes don't break you between releases.

## Development notes

- **Dev HMR and in-memory state.** Several modules use `globalThis.__downloadMusic*` to keep their state across HMR module re-evaluation: `lib/jobs.ts` (jobs), `lib/limits.ts` (rate buckets + slots), `app/api/preview/[videoId]/route.ts` (preview cache). Process restart is the only thing that clears them.
- **Cache invalidation in dev.** If you edit LLM rerank logic and want to retry a previously-resolved query, restart the dev server. HMR preserves caches; only a full restart clears them.
- **Tests.** Vitest. Files live under `lib/**/__tests__/*.test.ts`. Two legacy `node:test`-style files remain (`lib/llm/__tests__/degrade.test.ts`, `schemas.test.ts`); Vitest reports them as "no suite found" — harmless noise until migrated.
- **The Python sidecar.** Set `YTMUSIC_PYTHON` to the venv's python so the Node wrapper finds `ytmusicapi`. Without it, searches silently return zero candidates and the orchestrator throws "No songs found". The wrapper detects exit code 3 + `ytmusicapi` in stderr and surfaces a clear actionable error.
- **Cookies expire periodically.** YouTube rotates session tokens every 1–4 weeks. The 6-hourly health check pings `COOKIE_ALERT_WEBHOOK` when that happens; the refresh workflow is in `lib/cron/REFRESH-COOKIES.md` (~90 s of active time).

## License

MIT.
