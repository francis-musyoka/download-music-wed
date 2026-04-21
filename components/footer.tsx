export function Footer() {
  return (
    <footer className="foot">
      <div className="container-x">
        <div className="foot__grid">
          <div className="foot__brand">
            <h3 className="display">
              Musicography<em>.</em>
            </h3>
            <p>
              An open hit detector built on Spotify signal, YouTube data, and a
              healthy distrust of algorithms.
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
            <dd>MUS-2026-001</dd>
            <dd>Pressed on Contabo</dd>
            <dd>
              <strong>MIT Licence</strong>
            </dd>
          </dl>
        </div>
        <div className="foot__bottom">
          <span>© 2026 Musicography</span>
          <span>Track · Pipeline · Deploy</span>
          <span>v0.1 — Edition 001</span>
        </div>
      </div>
    </footer>
  );
}
