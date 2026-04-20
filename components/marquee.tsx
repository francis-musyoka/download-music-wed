const TICKER: Array<[string, string, string]> = [
  ["01", "Rema", "Calm Down"],
  ["02", "Burna Boy", "It's Plenty"],
  ["03", "Tems", "Free Mind"],
  ["04", "Davido", "Kante"],
  ["05", "Ayra Starr", "Commas"],
  ["06", "Asake", "Lonely at the Top"],
  ["07", "Omah Lay", "Soso"],
];

export function Marquee() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="marquee">
      <div className="marquee__track">
        {items.map(([num, artist, title], i) => (
          <span key={i}>
            <span className="num">{num}</span>
            {artist}
            <span className="dot">◆</span>
            {title}
          </span>
        ))}
      </div>
    </div>
  );
}
