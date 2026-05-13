"use client";

import { TextInput } from "@/components/ui/text-input";

interface Props {
    url: string;
    name: string;
    onUrl: (v: string) => void;
    onName: (v: string) => void;
}

export function UrlInput({ url, name, onUrl, onName }: Props) {
    return (
        <div className="flex flex-col gap-6">
            <TextInput
                label="URL"
                inputType="url"
                required
                value={url}
                placeholder="https://youtube.com/watch?v=… · open.spotify.com/… · soundcloud.com/…"
                onChange={(e) => onUrl(e.target.value)}
            />
            <TextInput
                label="Playlist name"
                value={name}
                placeholder="My Playlist"
                onChange={(e) => onName(e.target.value)}
            />
        </div>
    );
}
