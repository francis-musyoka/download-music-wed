import { z } from "zod";

export const SpotifyArtistSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const AlbumSchema = z.object({
    id: z.string(),
    name: z.string(),
    release_date: z.string(), // YYYY | YYYY-MM | YYYY-MM-DD
});

export const SpotifyTrackSchema = z.object({
    id: z.string(),
    name: z.string(),
    artists: z.array(SpotifyArtistSchema).min(1),
    album: AlbumSchema.optional(),
    duration_ms: z.number().int().nonnegative(),
    popularity: z.number().int().min(0).max(100).optional(),
    external_ids: z.object({
        isrc: z.string().optional(),
    }).optional(),
    uri: z.string(),
});
export type SpotifyTrack = z.infer<typeof SpotifyTrackSchema>;

export const SpotifyPlaylistSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().default(""),
    owner: z.object({
        id: z.string(),
        display_name: z.string().nullable().default(""),
    }),
    tracks: z.object({ total: z.number().int().nonnegative() }),
});
export type SpotifyPlaylist = z.infer<typeof SpotifyPlaylistSchema>;

export const SpotifyArtistFullSchema = SpotifyArtistSchema.extend({
    popularity: z.number().int().min(0).max(100).optional(),
    genres: z.array(z.string()).optional(),
});

// Response envelopes
export const SpotifySearchTracksResponseSchema = z.object({
    tracks: z.object({
        items: z.array(SpotifyTrackSchema),
        total: z.number().int().nonnegative(),
    }),
});

export const SpotifySearchArtistsResponseSchema = z.object({
    artists: z.object({
        items: z.array(SpotifyArtistFullSchema),
        total: z.number().int().nonnegative(),
    }),
});

export const SpotifySearchPlaylistsResponseSchema = z.object({
    playlists: z.object({
        items: z.array(SpotifyPlaylistSchema),
        total: z.number().int().nonnegative(),
    }),
});

export const SpotifyArtistTopTracksResponseSchema = z.object({
    tracks: z.array(SpotifyTrackSchema),
});

export const SpotifyPlaylistTracksResponseSchema = z.object({
    items: z.array(z.object({ track: SpotifyTrackSchema.nullable() })),
    total: z.number().int().nonnegative(),
});

export const SpotifyArtistAlbumsResponseSchema = z.object({
    items: z.array(z.object({ id: z.string() })),
    total: z.number().int().nonnegative(),
});

export const SpotifyAlbumTracksResponseSchema = z.object({
    items: z.array(SpotifyTrackSchema),
    total: z.number().int().nonnegative(),
});

export const SpotifyTokenResponseSchema = z.object({
    access_token: z.string(),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int().positive(),
});
