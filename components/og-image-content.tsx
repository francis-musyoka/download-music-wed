/**
 * JSX tree for the Open Graph card, rendered to PNG by Satori in
 * app/opengraph-image.tsx. Satori only supports inline styles and a
 * restricted subset of CSS — keep this file using inline `style` objects
 * and basic HTML elements only. Do not import client-side React features.
 */
export function OgImageContent() {
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "80px 96px",
                background: "#0c0a09",
                color: "#fafaf9",
                fontFamily: "Fraunces, serif",
            }}
        >
            <div
                style={{
                    fontSize: 18,
                    letterSpacing: "0.3em",
                    textTransform: "uppercase",
                    color: "#ff5a1f",
                    fontWeight: 600,
                }}
            >
                WAX · 2026 · CUT 001
            </div>

            <div style={{ display: "flex", alignItems: "baseline" }}>
                <span
                    style={{
                        fontSize: 380,
                        fontWeight: 500,
                        lineHeight: 0.85,
                        letterSpacing: "-0.05em",
                    }}
                >
                    W
                </span>
                <span
                    style={{
                        fontSize: 380,
                        color: "#ff5a1f",
                        lineHeight: 0.85,
                        marginLeft: -20,
                    }}
                >
                    .
                </span>
                <div
                    style={{
                        marginLeft: 56,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        paddingBottom: 40,
                    }}
                >
                    <span style={{ fontSize: 72, fontWeight: 500, lineHeight: 1 }}>WaxMusic</span>
                    <span style={{ fontSize: 26, color: "#a8a29e", marginTop: 12 }}>
                        Real hits, properly pressed
                    </span>
                </div>
            </div>

            <div
                style={{
                    display: "flex",
                    gap: 24,
                    fontSize: 18,
                    color: "#a8a29e",
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                }}
            >
                <span>Genre · Artist · Song · URL</span>
                <span style={{ color: "#44403c" }}>·</span>
                <span>320 kbps · No signup</span>
            </div>
        </div>
    );
}
