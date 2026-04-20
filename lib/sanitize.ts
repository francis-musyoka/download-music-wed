// Filesystem-safe filename helper. Strips path separators, traversal
// sequences, and control chars; collapses whitespace; clamps length.
// Reuse at every route boundary that builds a file/URL disposition name.
export function safeFilename(name: string, fallback = "playlist"): string {
  let cleaned = name
    .replace(/[/\\]/g, " ")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  while (cleaned.includes("..")) {
    cleaned = cleaned.replaceAll("..", ".");
  }
  cleaned = cleaned.slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}
