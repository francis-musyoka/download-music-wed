export function HowToDownload() {
  return (
    <section className="how" id="how">
      <div className="how__bg" />
      <div className="container-x">
        <div className="how__head">
          <h2 className="display">
            Four steps.
            <br />
            <em>Zero</em> <span className="hot">friction.</span>
          </h2>
          <span className="tag">Quick guide</span>
        </div>

        <div className="how__steps">
          <div className="how__step">
            <span className="how__step-num">1</span>
            <div className="how__step-icon">
              <div className="icon-tabs">
                <span className="live">Genre</span>
                <span>Artist</span>
                <span>Song</span>
                <span>URL</span>
              </div>
            </div>
            <h3 className="how__step-title">Choose how to search</h3>
            <p className="how__step-body">
              Pick <strong>Genre</strong> for a curated chart,{" "}
              <strong>Artist</strong> for top tracks, <strong>Song</strong> for
              a specific title, or paste a <strong>URL</strong>.
            </p>
          </div>

          <div className="how__step">
            <span className="how__step-num">2</span>
            <div className="how__step-icon">
              <div className="icon-chart">
                <div className="icon-chart__row">
                  <span className="icon-chart__rank">01</span>
                  <span className="icon-chart__bar" />
                  <span className="icon-chart__score">9.8</span>
                </div>
                <div className="icon-chart__row">
                  <span className="icon-chart__rank">02</span>
                  <span className="icon-chart__bar" style={{ width: "80%" }} />
                  <span className="icon-chart__score">9.4</span>
                </div>
                <div className="icon-chart__row">
                  <span className="icon-chart__rank">03</span>
                  <span className="icon-chart__bar" style={{ width: "60%" }} />
                  <span className="icon-chart__score">9.1</span>
                </div>
              </div>
            </div>
            <h3 className="how__step-title">Get ranked results</h3>
            <p className="how__step-body">
              We pull from Spotify and YouTube, score every track, and show you
              the <strong>top hits</strong> — sorted by plays, position, and
              recency.
            </p>
          </div>

          <div className="how__step">
            <span className="how__step-num">3</span>
            <div className="how__step-icon">
              <div className="icon-play">
                <div className="icon-play__btn">▶</div>
                <div className="icon-play__wave">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <span key={i} />
                  ))}
                </div>
              </div>
            </div>
            <h3 className="how__step-title">Preview in your browser</h3>
            <p className="how__step-body">
              Click the <strong>▶ Play</strong> button on any track to stream it
              instantly. Scrub, skip, decide — no commitment yet.
            </p>
          </div>

          <div className="how__step">
            <span className="how__step-num">4</span>
            <div className="how__step-icon">
              <div className="icon-dl">
                <div className="icon-dl__chip primary">
                  <span className="mark">↓</span>
                  <span>Single MP3</span>
                  <span>320k</span>
                </div>
                <div className="icon-dl__chip">
                  <span className="mark">↓</span>
                  <span>ZIP of all</span>
                  <span>10 tracks</span>
                </div>
                <div className="icon-dl__chip">
                  <span className="mark">↓</span>
                  <span>M3U playlist</span>
                  <span>.m3u</span>
                </div>
              </div>
            </div>
            <h3 className="how__step-title">Download what you love</h3>
            <p className="how__step-body">
              Save one track, grab them <strong>all as a ZIP</strong>, or export
              an <strong>M3U playlist</strong> that works in any car stereo.
            </p>
          </div>
        </div>

        <div className="how__cta">
          <a className="btn btn-accent" href="#app">
            Try it now <span>↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
