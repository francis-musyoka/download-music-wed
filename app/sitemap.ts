import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/brand";

// Single-page app — the home route is the only crawlable URL. Bump
// `lastModified` when the landing content materially changes.
const LAST_MODIFIED = "2026-06-02";

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: SITE_URL,
            lastModified: LAST_MODIFIED,
            changeFrequency: "weekly",
            priority: 1,
        },
    ];
}
