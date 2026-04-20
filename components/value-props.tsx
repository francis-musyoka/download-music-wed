const PROPS: Array<{ num: string; title: [string, string]; body: string }> = [
  {
    num: "01 / DETECTION",
    title: ["Real hits,", "not filler."],
    body: "Cross-references Spotify's curated playlists with YouTube signal, scores every candidate on playlist position, view count, and recency. You get what people actually listen to — ranked.",
  },
  {
    num: "02 / FIDELITY",
    title: ["320kbps with", "proper metadata."],
    body: "Embedded album art. Title, artist, album tags. Not a 128kbps ripoff. Your car stereo will thank you; so will the engineer who mixed it.",
  },
  {
    num: "03 / LICENCE",
    title: ["No signup.", "No ads. No tracking."],
    body: "One URL, four modes, zero accounts. No emails to verify, no pixels to block, no subscription to cancel. Run it, use it, close the tab.",
  },
];

export function ValueProps() {
  return (
    <section className="value" id="why">
      <div className="container-x">
        <div className="value__head">
          <h2 className="display">
            Not another
            <br />
            <em>generic</em> playlist app.
          </h2>
          <p
            className="eyebrow"
            style={{ maxWidth: 280, textAlign: "right", lineHeight: 1.8 }}
          >
            Three reasons
            <br />
            to stop trusting
            <br />
            algorithm soup.
          </p>
        </div>
        <div className="value__grid">
          {PROPS.map((p) => (
            <div key={p.num} className="value__card">
              <span className="value__num">{p.num}</span>
              <h3 className="value__title">
                {p.title[0]}
                <br />
                {p.title[1]}
              </h3>
              <p className="value__body">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
