import { SpotifyTokenResponseSchema } from "./schemas";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SAFETY_MARGIN_MS = 60_000;

type GlobalWithToken = typeof globalThis & {
    __downloadMusicSpotifyToken?: { accessToken: string | null; expiresAt: number };
    __downloadMusicSpotifyBreaker?: { failureCount: number; openUntil: number };
};

const g = globalThis as GlobalWithToken;
const tokenState =
    g.__downloadMusicSpotifyToken ??
    (g.__downloadMusicSpotifyToken = { accessToken: null, expiresAt: 0 });

export function createTokenFetcher(opts?: { fetchImpl?: typeof fetch }): () => Promise<string> {
    const fetchImpl = opts?.fetchImpl ?? fetch;

    return async function getToken(): Promise<string> {
        const now = Date.now();
        if (tokenState.accessToken && now < tokenState.expiresAt - SAFETY_MARGIN_MS) {
            return tokenState.accessToken;
        }

        const id = process.env.SPOTIFY_CLIENT_ID;
        const secret = process.env.SPOTIFY_CLIENT_SECRET;
        if (!id || !secret) {
            throw new Error("Spotify credentials missing");
        }

        const basic = Buffer.from(`${id}:${secret}`).toString("base64");
        const res = await fetchImpl(TOKEN_URL, {
            method: "POST",
            headers: {
                Authorization: `Basic ${basic}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
        });

        if (!res.ok) {
            throw new Error(`Spotify token request failed: ${res.status}`);
        }

        const parsed = SpotifyTokenResponseSchema.parse(await res.json());
        tokenState.accessToken = parsed.access_token;
        tokenState.expiresAt = Date.now() + parsed.expires_in * 1000;
        return parsed.access_token;
    };
}

export interface CircuitBreaker {
    isOpen(): boolean;
    recordFailure(): void;
    recordSuccess(): void;
}

const breakerState =
    g.__downloadMusicSpotifyBreaker ??
    (g.__downloadMusicSpotifyBreaker = { failureCount: 0, openUntil: 0 });

export function createCircuitBreaker(opts?: {
    threshold?: number;
    openMs?: number;
    now?: () => number;
}): CircuitBreaker {
    const threshold = opts?.threshold ?? 5;
    const openMs = opts?.openMs ?? 60_000;
    const now = opts?.now ?? Date.now;

    return {
        isOpen(): boolean {
            if (breakerState.openUntil > now()) return true;
            if (breakerState.openUntil !== 0 && breakerState.openUntil <= now()) {
                // half-open: reset for next attempt
                breakerState.openUntil = 0;
                breakerState.failureCount = 0;
            }
            return false;
        },
        recordFailure(): void {
            breakerState.failureCount += 1;
            if (breakerState.failureCount >= threshold) {
                breakerState.openUntil = now() + openMs;
            }
        },
        recordSuccess(): void {
            breakerState.failureCount = 0;
            breakerState.openUntil = 0;
        },
    };
}

// Shared breaker used by the production client. Tests use createCircuitBreaker directly with an injected `now`.
export const productionBreaker = createCircuitBreaker();
