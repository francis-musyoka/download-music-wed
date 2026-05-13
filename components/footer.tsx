import { BRAND_NAME } from "@/lib/constants/brand";

export function Footer() {
    return (
        <footer className="foot">
            <div className="container-x">
                <div className="foot__grid">
                    <div className="foot__brand">
                        <h3 className="display">
                            {BRAND_NAME}<em>.</em>
                        </h3>
                        <p>
                            An open hit detector. Cut from curated playlists, stream-count
                            signal, and a healthy distrust of algorithms.
                        </p>
                    </div>
                    <dl className="foot__col">
                        <dt>Side A</dt>
                        <dd>
                            <strong>Genre</strong>
                        </dd>
                        <dd>
                            <strong>Artist</strong>
                        </dd>
                        <dd>
                            <strong>Single</strong>
                        </dd>
                        <dd>
                            <strong>Direct URL</strong>
                        </dd>
                    </dl>
                    <dl className="foot__col">
                        <dt>Side B</dt>
                        <dd>320 kbps MP3</dd>
                        <dd>Embedded artwork</dd>
                        <dd>M3U export</dd>
                        <dd>ZIP bundle</dd>
                    </dl>
                    <dl className="foot__col">
                        <dt>Catalog</dt>
                        <dd>WAX-2026-001</dd>
                        <dd>
                            <strong>MIT Licence</strong>
                        </dd>
                    </dl>
                </div>
                <div className="foot__bottom">
                    <span>© 2026 {BRAND_NAME}</span>
                </div>
            </div>
        </footer>
    );
}
