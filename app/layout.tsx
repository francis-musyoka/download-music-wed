import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { BRAND_NAME, SITE_DESCRIPTION, SITE_URL } from "@/lib/constants/brand";

const TITLE = `${BRAND_NAME}: Real hits, properly pressed`;

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: {
        default: TITLE,
        template: `%s · ${BRAND_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: BRAND_NAME,
    keywords: [
        "music discovery",
        "hit detector",
        "new music",
        "trending songs",
        "playlist curation",
        BRAND_NAME,
    ],
    alternates: {
        canonical: "/",
    },
    openGraph: {
        type: "website",
        siteName: BRAND_NAME,
        title: TITLE,
        description: SITE_DESCRIPTION,
        url: SITE_URL,
    },
    twitter: {
        card: "summary_large_image",
        title: TITLE,
        description: SITE_DESCRIPTION,
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
        },
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin=""
                />
                <link
                    href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,100..900,0..100,0..1;1,9..144,100..900,0..100,0..1&family=JetBrains+Mono:wght@300;400;500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                {children}
                <Toaster />
            </body>
            {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
        </html>
    );
}
