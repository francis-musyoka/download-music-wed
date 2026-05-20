import { createTokenFetcher, productionBreaker } from "./auth";
import { spotifyCache, type CacheKey } from "./cache";
import {
    SpotifySearchTracksResponseSchema,
    SpotifySearchArtistsResponseSchema,
    SpotifySearchPlaylistsResponseSchema,
    SpotifyArtistTopTracksResponseSchema,
    SpotifyPlaylistTracksResponseSchema,
    SpotifyArtistAlbumsResponseSchema,
    SpotifyAlbumTracksResponseSchema,
    type SpotifyTrack,
    type SpotifyPlaylist,
} from "./schemas";

const API_BASE = "https://api.spotify.com/v1";
const DEFAULT_TIMEOUT_MS = Number(process.env.SPOTIFY_REQUEST_TIMEOUT_MS ?? 5000);

const TTL = {
    artistTop: Number(process.env.SPOTIFY_TTL_ARTIST_TOP_MS ?? 21_600_000),
    genre: Number(process.env.SPOTIFY_TTL_GENRE_MS ?? 43_200_000),
    search: Number(process.env.SPOTIFY_TTL_SEARCH_MS ?? 3_600_000),
    artistId: Number(process.env.SPOTIFY_TTL_ARTIST_ID_MS ?? 86_400_000),
    playlistTracks: Number(process.env.SPOTIFY_TTL_PLAYLIST_TRACKS_MS ?? 21_600_000),
};

export interface SpotifyClient {
    searchTracks(
        q: string,
        opts?: { limit?: number; offset?: number; market?: string },
    ): Promise<SpotifyTrack[]>;
    getArtistTopTracks(artistId: string, market?: string): Promise<SpotifyTrack[]>;
    searchArtist(name: string): Promise<{ id: string; name: string } | null>;
    getArtistAlbums(
        artistId: string,
        opts?: { limit?: number; offset?: number },
    ): Promise<{ id: string }[]>;
    getAlbumTracks(albumId: string): Promise<SpotifyTrack[]>;
    searchPlaylists(q: string, opts?: { limit?: number }): Promise<SpotifyPlaylist[]>;
    getPlaylistTracks(playlistId: string, opts?: { limit?: number }): Promise<SpotifyTrack[]>;
}

export function createSpotifyClient(opts?: { fetchImpl?: typeof fetch }): SpotifyClient {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    const getToken = createTokenFetcher({ fetchImpl });

    async function call<T>(
        path: string,
        cacheKey: CacheKey,
        ttlMs: number,
        parse: (body: unknown) => T,
    ): Promise<T> {
        const key = spotifyCache.makeKey(cacheKey);
        return spotifyCache.getOrLoad<T>(key, ttlMs, async () => {
            return doFetch<T>(path, parse);
        });
    }

    async function doFetch<T>(path: string, parse: (body: unknown) => T): Promise<T> {
        const attempt = async (): Promise<T> => {
            const token = await getToken();
            const ctrl = new AbortController();
            const timeoutId = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
            try {
                const res = await fetchImpl(`${API_BASE}${path}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: ctrl.signal,
                });

                if (res.status === 429) {
                    const retryAfter = Number(res.headers.get("retry-after") ?? 0);
                    if (retryAfter > 0 && retryAfter <= 5) {
                        await new Promise((r) => setTimeout(r, retryAfter * 1000));
                        const res2 = await fetchImpl(`${API_BASE}${path}`, {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        if (!res2.ok) throw new Error(`Spotify 429-after-retry: ${res2.status}`);
                        return parse(await res2.json());
                    }
                    throw new Error(`Spotify 429: retry-after ${retryAfter}s`);
                }

                if (res.status === 401) {
                    // refresh-and-retry once
                    const fresh = await getToken();
                    const res2 = await fetchImpl(`${API_BASE}${path}`, {
                        headers: { Authorization: `Bearer ${fresh}` },
                    });
                    if (!res2.ok) throw new Error(`Spotify 401-after-refresh: ${res2.status}`);
                    return parse(await res2.json());
                }

                if (res.status >= 500) {
                    throw new Error(`Spotify 5xx: ${res.status}`);
                }

                if (!res.ok) {
                    throw new Error(`Spotify ${res.status}`);
                }

                return parse(await res.json());
            } finally {
                clearTimeout(timeoutId);
            }
        };

        try {
            const result = await attempt();
            productionBreaker.recordSuccess();
            return result;
        } catch (err) {
            // 5xx → retry once
            if (err instanceof Error && err.message.startsWith("Spotify 5xx:")) {
                await new Promise((r) => setTimeout(r, 500));
                try {
                    const result = await attempt();
                    productionBreaker.recordSuccess();
                    return result;
                } catch (err2) {
                    productionBreaker.recordFailure();
                    throw err2;
                }
            }
            productionBreaker.recordFailure();
            throw err;
        }
    }

    return {
        async searchTracks(q, options) {
            const params = {
                q,
                type: "track",
                limit: options?.limit ?? 50,
                offset: options?.offset ?? 0,
                ...(options?.market ? { market: options.market } : {}),
            };
            const path = `/search?${new URLSearchParams(params as unknown as Record<string, string>).toString()}`;
            const body = await call<unknown>(
                path,
                { endpoint: "searchTracks", params },
                TTL.search,
                (b) => SpotifySearchTracksResponseSchema.parse(b),
            );
            return (body as { tracks: { items: SpotifyTrack[] } }).tracks.items;
        },

        async getArtistTopTracks(artistId, market = "US") {
            const path = `/artists/${encodeURIComponent(artistId)}/top-tracks?market=${market}`;
            const body = await call<unknown>(
                path,
                { endpoint: "getArtistTopTracks", params: { artistId, market } },
                TTL.artistTop,
                (b) => SpotifyArtistTopTracksResponseSchema.parse(b),
            );
            return (body as { tracks: SpotifyTrack[] }).tracks;
        },

        async searchArtist(name) {
            const params = { q: name, type: "artist", limit: 1 };
            const path = `/search?${new URLSearchParams(params as unknown as Record<string, string>).toString()}`;
            const body = await call<unknown>(
                path,
                { endpoint: "searchArtist", params: { name } },
                TTL.artistId,
                (b) => SpotifySearchArtistsResponseSchema.parse(b),
            );
            const items = (body as { artists: { items: { id: string; name: string }[] } }).artists.items;
            return items[0] ?? null;
        },

        async getArtistAlbums(artistId, options) {
            const params = {
                include_groups: "album,single",
                limit: options?.limit ?? 20,
                offset: options?.offset ?? 0,
            };
            const path = `/artists/${encodeURIComponent(artistId)}/albums?${new URLSearchParams(params as unknown as Record<string, string>).toString()}`;
            const body = await call<unknown>(
                path,
                { endpoint: "getArtistAlbums", params: { artistId, ...params } },
                TTL.playlistTracks,
                (b) => SpotifyArtistAlbumsResponseSchema.parse(b),
            );
            return (body as { items: { id: string }[] }).items;
        },

        async getAlbumTracks(albumId) {
            const path = `/albums/${encodeURIComponent(albumId)}/tracks?limit=50`;
            const body = await call<unknown>(
                path,
                { endpoint: "getAlbumTracks", params: { albumId } },
                TTL.playlistTracks,
                (b) => SpotifyAlbumTracksResponseSchema.parse(b),
            );
            return (body as { items: SpotifyTrack[] }).items;
        },

        async searchPlaylists(q, options) {
            const params = { q, type: "playlist", limit: options?.limit ?? 10 };
            const path = `/search?${new URLSearchParams(params as unknown as Record<string, string>).toString()}`;
            const body = await call<unknown>(
                path,
                { endpoint: "searchPlaylists", params: { q, limit: options?.limit ?? 10 } },
                TTL.genre,
                (b) => SpotifySearchPlaylistsResponseSchema.parse(b),
            );
            return (body as { playlists: { items: SpotifyPlaylist[] } }).playlists.items;
        },

        async getPlaylistTracks(playlistId, options) {
            const params = { limit: options?.limit ?? 50 };
            const path = `/playlists/${encodeURIComponent(playlistId)}/tracks?${new URLSearchParams(params as unknown as Record<string, string>).toString()}`;
            const body = await call<unknown>(
                path,
                { endpoint: "getPlaylistTracks", params: { playlistId, ...params } },
                TTL.playlistTracks,
                (b) => SpotifyPlaylistTracksResponseSchema.parse(b),
            );
            const items = (body as { items: { track: SpotifyTrack | null }[] }).items;
            return items.map((i) => i.track).filter((t): t is SpotifyTrack => t !== null);
        },
    };
}
