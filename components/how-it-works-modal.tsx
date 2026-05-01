"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";

const STEPS: Array<[string, string, string]> = [
  [
    "01",
    "Pick your mode",
    "Genre, artist, song title, or a direct URL. Each mode taps a different scraping path.",
  ],
  [
    "02",
    "We scan the web",
    "Crate-digs through curated genre playlists for real, human-picked hits. Enriches each candidate with stream counts and release dates.",
  ],
  [
    "03",
    "Smart ranking",
    "Each candidate gets a hit score: playlist appearances × position × views × recency. Mixes and compilations are filtered out.",
  ],
  [
    "04",
    "Diversity cap",
    "Genre mode caps any single artist at 2 songs so the chart reflects a scene, not a superstar's catalogue.",
  ],
  [
    "05",
    "Preview in place",
    "Each ranked track streams in your browser with scrub support. No commitment — skip anything that doesn't grab you in ten seconds.",
  ],
  [
    "06",
    "Take what you love",
    "Download one track at 320kbps, grab the whole chart as a ZIP, or export an M3U playlist any player can read.",
  ],
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function HowItWorksModal({ open, onOpenChange }: Props) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="modal-overlay" />
        <DialogPrimitive.Content
          className="modal"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            How the cut is made
          </DialogPrimitive.Title>
          <div className="modal__head">
            <span className="eyebrow">Liner notes · How the cut is made</span>
            <DialogPrimitive.Close
              className="modal__close"
              aria-label="Close"
            >
              ✕
            </DialogPrimitive.Close>
          </div>
          <div className="modal__body">
            <h3 className="modal__title display">
              Six steps from
              <br />
              <em>signal</em> to ear.
            </h3>
            <div className="modal__steps">
              {STEPS.map(([n, t, b]) => (
                <div key={n} className="modal__step">
                  <span className="num">{n}</span>
                  <div>
                    <h4>{t}</h4>
                    <p>{b}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
