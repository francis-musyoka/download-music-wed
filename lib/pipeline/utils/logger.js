const pino = require("pino");

// Structured pipeline logger. Level comes from LOG_LEVEL (defaults to "info").
// Pino emits one JSON object per line on stdout — greppable, jq-friendly, and
// cleanly consumed by PM2 log files without ANSI escape noise.
//
// The public surface (info/success/warn/error/header/dim/progress) is kept
// stable so existing pipeline callers don't change. Pino only has 6 levels
// (trace/debug/info/warn/error/fatal), so the richer call names map to
// info/debug with a small `event` discriminator for downstream filtering.
const base = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { module: "pipeline" },
});

function info(msg) {
  base.info(msg);
}

function success(msg) {
  base.info({ event: "success" }, msg);
}

function warn(msg) {
  base.warn(msg);
}

function error(msg) {
  base.error(msg);
}

function header(msg) {
  base.info({ event: "header" }, msg);
}

function dim(msg) {
  base.debug(msg);
}

function progress(current, total, msg) {
  base.info({ current, total }, msg);
}

module.exports = { info, success, warn, error, header, dim, progress };
