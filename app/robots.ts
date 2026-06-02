import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/brand";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            // /api/* is all request-scoped JSON/SSE/binary endpoints — nothing
            // crawlable, and indexing them wastes crawl budget.
            disallow: "/api/",
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
