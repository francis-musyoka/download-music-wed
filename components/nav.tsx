"use client";

interface NavProps {
  onHowClick: () => void;
}

export function Nav({ onHowClick }: NavProps) {
  return (
    <nav className="nav-bar">
      <div className="nav-brand">
        <strong>
          Wax
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>.</em>
        </strong>
      </div>
      <div className="nav-links">
        <a className="nav-link" href="#why">
          Why
        </a>
        <a className="nav-link" href="#app">
          Start
        </a>
        <a
          className="nav-link"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onHowClick();
          }}
        >
          How it works
        </a>
      </div>
    </nav>
  );
}
