#!/bin/bash
# Cookie health check — runs from /etc/cron.d/wax every 6 hours.
#
# Tries a yt-dlp dry-run against a stable videoId using the current cookies.
# If yt-dlp returns the "Sign in to confirm you're not a bot" warning, the
# cookies have been rotated/expired upstream and need a manual refresh.
# Pings a webhook (Discord or Slack format auto-detected) when that happens.
#
# Required env (read from /var/www/download-music-wed/.env):
#   YT_DLP_COOKIES        — path to cookies.txt
#   COOKIE_ALERT_WEBHOOK  — webhook URL (Discord, Slack, etc.). Unset = silent.
# Optional:
#   COOKIE_HEALTH_VIDEO_ID — videoId to probe (default: GodmYPfMaio)
#
# Exits 0 on success and on silent-skip (no webhook / no cookies file). Never
# kills cron with a non-zero exit even if yt-dlp errors — the alert is the
# only signal we care about.

set -u

APP_DIR="/var/www/download-music-wed"

# Cron has a minimal PATH and doesn't source any shell rc. Load the project's
# .env explicitly so YT_DLP_COOKIES / COOKIE_ALERT_WEBHOOK / YTMUSIC_PYTHON
# are available to this script.
if [ -f "$APP_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$APP_DIR/.env"
    set +a
fi

COOKIES="${YT_DLP_COOKIES:-$APP_DIR/cookies.txt}"
WEBHOOK="${COOKIE_ALERT_WEBHOOK:-}"
VIDEO_ID="${COOKIE_HEALTH_VIDEO_ID:-GodmYPfMaio}"

# Silent skip if nothing to do: no webhook configured, or no cookies file yet
# (e.g., during initial deploy before cookies are shipped).
[ -z "$WEBHOOK" ] && exit 0
[ ! -f "$COOKIES" ] && exit 0

# Dry-run yt-dlp; capture stderr/stdout. `|| true` so a non-zero exit (yt-dlp
# almost always exits non-zero on bot detection) doesn't kill the script.
OUT=$(yt-dlp --cookies "$COOKIES" \
             --remote-components ejs:github \
             --skip-download --no-warnings \
             "https://www.youtube.com/watch?v=$VIDEO_ID" 2>&1 || true)

# If the canonical bot-detection string isn't there, cookies are still good.
if ! echo "$OUT" | grep -q "Sign in to confirm"; then
    exit 0
fi

# Cookies are dead — send the alert. Discord wants {"content":"..."}, Slack
# wants {"text":"..."}; sniff the URL to pick the right shape.
TS=$(date -u +"%Y-%m-%d %H:%M UTC")
MSG="⚠️ WaxMusic cookies expired at $TS — yt-dlp hit YouTube's bot wall. Refresh via Profile 15 + Get cookies.txt LOCALLY extension + scp to VPS + pm2 restart wax."

if [[ "$WEBHOOK" == *"slack.com"* ]]; then
    PAYLOAD=$(printf '{"text": %s}' "$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
else
    PAYLOAD=$(printf '{"content": %s}' "$(printf '%s' "$MSG" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")
fi

curl -s -X POST "$WEBHOOK" \
     -H 'Content-Type: application/json' \
     -d "$PAYLOAD" >/dev/null || true

exit 0
