"use client";

import { TextInput } from "@/components/ui/text-input";

interface Props {
    title: string;
    artist: string;
    onTitle: (v: string) => void;
    onArtist: (v: string) => void;
}

export function SongInput({ title, artist, onTitle, onArtist }: Props) {
    return (
        <div className="flex flex-col gap-6">
            <TextInput
                label="Song title"
                value={title}
                placeholder="Essence"
                onChange={(e) => onTitle(e.target.value)}
            />
            <TextInput
                label="Artist"
                value={artist}
                placeholder="Wizkid"
                onChange={(e) => onArtist(e.target.value)}
            />
        </div>
    );
}
