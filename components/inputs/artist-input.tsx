"use client";

import { useEffect, useState } from "react";
import { TextInput } from "@/components/ui/text-input";

interface Props {
    artist: string;
    limit: number;
    name: string;
    onArtist: (v: string) => void;
    onLimit: (v: number) => void;
    onName: (v: string) => void;
}

export function ArtistInput({ artist, limit, name, onArtist, onLimit, onName }: Props) {
    const [raw, setRaw] = useState(String(limit));
    useEffect(() => { setRaw(String(limit)); }, [limit]);

    return (
        <div className="flex flex-col gap-6">
            <TextInput
                label="Artist"
                value={artist}
                placeholder="Burna Boy · Tems · Asake…"
                onChange={(e) => onArtist(e.target.value)}
            />
            <TextInput
                label="Limit"
                inputType="number"
                value={raw}
                min={1}
                max={10}
                onChange={(e) => {
                    const v = e.target.value;
                    setRaw(v);
                    const n = parseInt(v, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= 10) onLimit(n);
                }}
                onBlur={(e) => {
                    const n = parseInt(e.target.value, 10);
                    const clamped = Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1;
                    setRaw(String(clamped));
                    onLimit(clamped);
                }}
            />
            <TextInput
                label="Playlist name"
                value={name}
                placeholder="Best of Burna Boy"
                onChange={(e) => onName(e.target.value)}
            />
        </div>
    );
}
