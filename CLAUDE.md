# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

- `README.md` — full product description, stack, architecture diagram, the genre/artist pipeline step-by-step, env vars, security invariants, deploy steps. Treat it as the canonical overview; don't duplicate it here.
- `.claude/skills/reviewing-pull-requests/SKILL.md` — load-bearing security/architecture invariants enforced on every PR review. Read before touching API routes, `lib/pipeline/**`, `lib/jobs.ts`, `lib/limits.ts`, or `lib/session.ts`.
- `TODO.md` — open work items with rationale.

## Commands

```bash
npm run dev          # next dev (default PORT=3000; .env sets 4000)
npm run build        # next build
npm run start        # serve production build
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch mode
npm run eval         # scripts/eval-search.ts — search-quality eval harness
```

Run a single test file:
```bash
npm test -- <name-fragment>     # vitest filters by filename substring
```

First-time setup: install `ytmusicapi` into a project-local venv per `requirements-ytmusicapi.txt` (`python3 -m venv .venv-ytmusic && .venv-ytmusic/bin/pip install -r requirements-ytmusicapi.txt`). Export `YTMUSIC_PYTHON` to point at that venv's python. System binaries on PATH: `yt-dlp`, `ffmpeg`, `spotdl` (optional). The app no longer uses Playwright/Chromium. The app degrades gracefully without `OPENAI_API_KEY` but quality drops noticeably.

## Architecture quick-orient

The README has the diagram. Mental model for a request:

```
app/page.tsx ──POST──> /api/{rank,download} ──> lib/pipeline/orchestrator.ts
                                                   │
                                                   ├─ scrapers/ytmusic-api.js + ytmusic_search.py  (ytmusicapi via Python sidecar)
                                                   ├─ scrapers/youtube.js                          (yt-dlp download)
                                                   ├─ scoring/{noiseFilter,hitScore,diversity}.js
                                                   ├─ utils/title-match.ts                         (song-mode pin)
                                                   └─ llm/rerankCandidates.ts                      (genre-mode only, top 50)

app/page.tsx ──GET (SSE)──> /api/progress/[jobId] ──> lib/jobs.ts subscribers
```

Job state, rate buckets, and preview cache live in process memory — no database, no Redis. They are hoisted onto `globalThis.__downloadMusic*` keys so Next.js dev HMR doesn't reset them. Process restart is the only thing that clears them. See "globalThis hoisting" below.

## Project-specific invariants (don't violate, don't refactor away)

These are the things that break the app or its security model if you're not paying attention. The PR-review skill is the authoritative list; the highlights:

1. **Argv-array `execFile` only.** No `exec`, no `{ shell: true }`, no template-string commands. Files that shell out: `app/api/preview/[videoId]/route.ts`, `lib/pipeline/deps.ts`, `lib/pipeline/scrapers/*.js`.
2. **Path-traversal guard on `/api/audio/[file]`** — `path.basename` + containment check against `MUSIC_DIR_RESOLVED`. Same shape required for any new file-serving route.
3. **YouTube URL allowlist** in `/api/download` (`youtube.com`, `www.`, `m.`, `music.`, `youtu.be`, `https:` only). Apply the same guard to any new URL-accepting endpoint.
4. **Session isolation:** `/api/progress/[jobId]` and `/api/zip/[jobId]` compare the `dm_session` cookie to `job.sessionId` and return **404** (not 403) on mismatch — don't confirm existence.
5. **Rate-limit + slot order:** `checkRate → reserveSlot → createJob → run`; slot is released in both the complete and fail paths. New long-running endpoints must participate in slot accounting (`lib/limits.ts`).
6. **`globalThis` hoisting for in-memory state.** Use the documented pattern (`globalThis.__downloadMusic* ??= new Map()`). A bare module-level `new Map()` will be reset by HMR in dev and produces ghost-state bugs. Don't "clean it up" because it looks weird.
7. **`emit()` for job progress** (`lib/jobs.ts`). Subscribers only receive events sent through `emit()`. Direct `job.stage = "..."` or `job.events.push(...)` will not reach SSE clients.
8. **Next.js 15 async params.** Dynamic route handlers must `await params` (`params: Promise<{...}>`). Synchronous destructure won't typecheck and won't work.
9. **`safeFilename()` (`lib/sanitize.ts`) on every user-facing filename** — playlist names, ZIP outputs, downloads. Don't bypass.
10. **Video ID regex** `^[a-zA-Z0-9_-]{11}$` at the boundary in `/api/preview/[videoId]`. Don't rely on yt-dlp to validate.
11. **ytmusicapi via Python sidecar.** `lib/pipeline/scrapers/ytmusic_search.py` is invoked via argv-array `execFile` from `lib/pipeline/scrapers/ytmusic-api.js`. The `YTMUSIC_PYTHON` env var points at a venv with `ytmusicapi` installed. Genre mode runs 3 parallel searches (bare, `+hits`, `+new`); `+new` tracks get the bucketed hit-score boost. See `docs/superpowers/specs/2026-05-21-ytmusicapi-source-redesign.md`.
12. **Two-tier daily quota** in `lib/limits.ts`: `overall` (150/day) counts every genre+artist search; `expensive` (30/day) only counts when `rerankCandidates` fires.

## Things that look wrong but aren't

- **`lib/pipeline/**` is intentionally CommonJS `.js`** — it was ported byte-for-byte from a CLI ancestor. TypeScript may suggest converting to `.ts`; don't. The orchestrator and friends interop with these via `lib/pipeline/deps.ts`.
- **Internal identifier prefix `download-music-web` / `dm_session` / `__downloadMusic*`** stays even though the product is now branded "WaxMusic." It preserves the existing data dir, cookie, and PM2 process name. Don't rename.
- **No Zod for request validation.** Validation in API routes is manual (length clamps, hard-coded enum sets, regex for structured IDs). Zod is only used for LLM response shape. Don't add Zod to routes unless the PR is converting all of them.
- **Vitest, not `node:test`.** Tests live under `lib/**/__tests__/*.test.ts` and run via `npm test` (Vitest). A few legacy `node:test`-style files remain (`lib/llm/__tests__/{degrade,schemas}.test.ts`); Vitest reports them as "no suite found" — harmless noise until migrated.
- **All components are `"use client"`.** This is a single-page app driven by SSE; there is no server-component story here. Don't introduce one as a one-off.
- **Toast system is single-toast (`TOAST_LIMIT = 1`), no auto-dismiss** — don't add a second one or change the limit.

## Configuration

`.env.example` is authoritative. Notable beyond what the README covers:

- `CLEANUP_MAX_AGE_DAYS` / `CLEANUP_INTERVAL_HOURS` drive `lib/disk-cleanup.ts`, which sweeps stale files from `MUSIC_DIR` and `PLAYLISTS_DIR` to keep disk bounded. The sweeper bootstraps from `lib/jobs.ts` on first job creation.
- `YT_DLP_PREVIEW_TIMEOUT_MS` (default 60s) and the `PREVIEW_*` cache tunables target VPS cold-call latency for `/api/preview/[videoId]`.

## Working with the in-memory caches

If you change LLM rerank logic or other in-memory state, **restart the dev server**. The preview cache and job map live in process memory and HMR preserves them; only a full restart clears them.
