const path = require("path");

// Next.js compiles this file into .next/server/..., so __dirname would resolve
// to an inaccessible build artifact dir. process.cwd() is the actual server CWD.
const ROOT_DIR = process.cwd();

const MUSIC_DIR = process.env.MUSIC_DIR
  ? path.resolve(process.env.MUSIC_DIR)
  : path.join(ROOT_DIR, "music");

const PLAYLISTS_DIR = process.env.PLAYLISTS_DIR
  ? path.resolve(process.env.PLAYLISTS_DIR)
  : path.join(ROOT_DIR, "playlists");

const DEFAULT_LIMIT = 10;
const MAX_DURATION = 600; // 10 minutes — anything longer is likely a mix
const MIN_DURATION = 60;  // 1 minute — skip intros/shorts
const MAX_PER_ARTIST = 2; // diversity cap

// Words that indicate mixes, compilations, or non-song content
const BLACKLIST = [
  "mix", "nonstop", "compilation", "medley", "hours", "hour",
  "playlist", "mashup", "megamix", "non-stop", "non stop",
  "collection", "jukebox", "juke-box", "best of all time",
  "dj remix", "dj non stop", "relaxation", "sleep", "study",
  "ambient", "lofi", "lo-fi", "white noise", "rain sounds",
  "top 100", "top 50", "top 10", "greatest hits album",
];

module.exports = {
  ROOT_DIR,
  MUSIC_DIR,
  PLAYLISTS_DIR,
  DEFAULT_LIMIT,
  MAX_DURATION,
  MIN_DURATION,
  MAX_PER_ARTIST,
  BLACKLIST,
};
