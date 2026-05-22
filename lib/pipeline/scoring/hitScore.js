/**
 * Hit-score engine — rebuilt 2026-05-21 to use ytmusicapi's views signal
 * directly, with a bucketed additive boost for tracks tagged as "new"
 * (surfaced by the `q+"new"` parallel query in genre mode).
 *
 * Why no recency, position, or playlistCount: see
 * docs/superpowers/specs/2026-05-21-ytmusicapi-source-redesign.md
 */

// Additive to log10(views), applied only when track.inNewPool=true.
// Scanned in descending threshold order; first match wins.
const NEW_BOOST_BUCKETS = [
  [10_000_000, 1.8],   // ≥10M — standard boost
  [ 5_000_000, 1.5],
  [ 1_000_000, 1.3],
  [   500_000, 1.0],
  [   100_000, 0.6],
  [         0, 0.3],
];

function newBoost(views) {
  for (const [threshold, boost] of NEW_BOOST_BUCKETS) {
    if (views >= threshold) return boost;
  }
  return 0;
}

function hitScore(track) {
  const views = Math.max(track.views || 0, 0);
  if (views === 0) return 0;
  const base = Math.log10(views);
  return base + (track.inNewPool ? newBoost(views) : 0);
}

function rankCandidates(candidates) {
  return [...candidates].sort((a, b) => hitScore(b) - hitScore(a));
}

module.exports = { rankCandidates, hitScore, newBoost, NEW_BOOST_BUCKETS };
