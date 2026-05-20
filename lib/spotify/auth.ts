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

/** Forces the next getToken() call to bypass the cache. */
export function clearTokenCache(): void {
    tokenState.expiresAt = 0;
}

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

interface BreakerState {
    failureCount: number;
    openUntil: number;
}

function makeBreaker(
    state: BreakerState,
    threshold: number,
    openMs: number,
    now: () => number,
): CircuitBreaker {
    return {
        isOpen(): boolean {
            if (state.openUntil > now()) return true;
            if (state.openUntil !== 0 && state.openUntil <= now()) {
                // half-open: reset for next attempt
                state.openUntil = 0;
                state.failureCount = 0;
            }
            return false;
        },
        recordFailure(): void {
            state.failureCount += 1;
            if (state.failureCount >= threshold) {
                state.openUntil = now() + openMs;
            }
        },
        recordSuccess(): void {
            state.failureCount = 0;
            state.openUntil = 0;
        },
    };
}

export function createCircuitBreaker(opts?: {
    threshold?: number;
    openMs?: number;
    now?: () => number;
}): CircuitBreaker {
    const state: BreakerState = { failureCount: 0, openUntil: 0 };
    return makeBreaker(
        state,
        opts?.threshold ?? 5,
        opts?.openMs ?? 60_000,
        opts?.now ?? Date.now,
    );
}

// Production singleton — uses globalThis-hoisted state so HMR doesn't reset it
// (matches the project's hoisting pattern).
const productionBreakerState =
    g.__downloadMusicSpotifyBreaker ??
    (g.__downloadMusicSpotifyBreaker = { failureCount: 0, openUntil: 0 });

export const productionBreaker = makeBreaker(productionBreakerState, 5, 60_000, Date.now);
