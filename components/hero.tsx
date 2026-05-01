"use client";

import { Marquee } from "./marquee";

interface HeroProps {
  onHowClick: () => void;
}

export function Hero({ onHowClick }: HeroProps) {
  return (
    <section className="hero">
      <div className="hero__bg" />
      <div className="hero__grid-lines" />
      <div className="container-x hero__content">
        <div>
          <div className="hero__meta">
            <div className="hero__meta-row">
              <span className="dot" />
              <span>The needle is hot</span>
            </div>
            <div className="hero__meta-row">
              Wax · Cut 001 · 2026
            </div>
          </div>
          <h1 className="hero__title display">
            The
            <br />
            <em>Real Hits.</em>
            <br />
            Downloaded.
          </h1>
          <p className="hero__sub">
            Search by genre, artist, song name, or paste a link.{" "}
            <strong>Preview every track in your browser first</strong>, then
            download the ones you love as 320kbps MP3s. No signup. No ads.
          </p>
          <div className="hero__ctas">
            <a className="btn btn-accent" href="#app">
              Start searching <span>→</span>
            </a>
            <a
              className="btn btn-ghost"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onHowClick();
              }}
            >
              How it works
            </a>
          </div>
        </div>
        <div className="hero__edition">
          <span>Cut</span>
          <strong>001</strong>
          <span>Side A · 2026</span>
        </div>
      </div>
      <Marquee />
    </section>
  );
}
