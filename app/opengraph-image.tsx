import { ImageResponse } from "next/og";
import { OgImageContent } from "@/components/og-image-content";

export const alt = "WaxMusic — Real hits, properly pressed";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FRAUNCES_TTF =
    "https://github.com/undercasetype/Fraunces/raw/master/fonts/static/TTF/Fraunces-Medium.ttf";

export default async function Image() {
    let fontData: ArrayBuffer | null = null;
    try {
        const res = await fetch(FRAUNCES_TTF);
        if (res.ok) fontData = await res.arrayBuffer();
    } catch {
        // Fall back to Satori's bundled default if the font CDN is unreachable.
    }

    return new ImageResponse(<OgImageContent />, {
        ...size,
        fonts: fontData
            ? [{ name: "Fraunces", data: fontData, style: "normal", weight: 500 }]
            : undefined,
    });
}
