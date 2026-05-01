export function Footer() {
  return (
    <footer className="foot">
      <div className="container-x">
        <div className="foot__grid">
          <div className="foot__brand">
            <h3 className="display">
              Wax<em>.</em>
            </h3>
            <p>
              An open hit detector. Cut from Spotify signal, YouTube data, and a
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
            <dd>WAX-2026-001</dd>
            <dd>
              <strong>MIT Licence</strong>
            </dd>
          </dl>
        </div>
        <div className="foot__bottom">
          <span>© 2026 Wax</span>
        </div>
      </div>
    </footer>
  );
}
