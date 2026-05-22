# lib/cron/

Scheduled jobs that run on the VPS. Each `.cron` file in this folder is a
ready-to-install [`/etc/cron.d/`](https://man7.org/linux/man-pages/man5/crontab.5.html)
unit — the format includes the username column, so dropping a file into
`/etc/cron.d/` activates it without invoking `crontab -e`.

## What's in here

| File | What it does |
| --- | --- |
| `wax.cron` | Schedule entries. Weekly upgrades for `yt-dlp` + `spotdl` (Mon 04:00), `ytmusicapi` (Mon 04:15), and a 6-hourly cookie health check that calls `check-cookies.sh`. |
| `check-cookies.sh` | Probes yt-dlp with the current cookies file. If YouTube returns "Sign in to confirm you're not a bot", POSTs an alert to `COOKIE_ALERT_WEBHOOK` (Discord/Slack URL). Silent if the env var is unset. |

Disk cleanup of `music/` and `playlists/` is **not** in here — it runs
in-process from `lib/disk-cleanup.ts` every 6 hours, bootstrapped from the
orchestrator on first job creation. No cron entry needed.

## Required env (set in `/var/www/download-music-wed/.env`)

| Var | Purpose |
| --- | --- |
| `YT_DLP_COOKIES` | Path to the cookies.txt file (already in place from the main deploy) |
| `COOKIE_ALERT_WEBHOOK` | Discord or Slack webhook URL. Without this, `check-cookies.sh` exits silently — installing the cron alone won't alert anyone. |
| `COOKIE_HEALTH_VIDEO_ID` | *(optional)* override for the videoId the health check probes. |

## Install on the VPS (one-time, as root)

```bash
sudo install -m 644 /var/www/download-music-wed/lib/cron/wax.cron /etc/cron.d/wax
sudo mkdir -p /var/log/wax
# check-cookies.sh must be executable; git preserves the bit but verify after a fresh clone:
sudo chmod +x /var/www/download-music-wed/lib/cron/check-cookies.sh
```

For the cookie health check to actually alert, add a webhook to `.env`:

```bash
# Discord example: server → channel → settings → Integrations → Webhooks → New Webhook → copy URL
echo 'COOKIE_ALERT_WEBHOOK=https://discord.com/api/webhooks/...' >> /var/www/download-music-wed/.env
# pm2 restart not required — the cron reads .env fresh each run.

# Smoke-test the script immediately (don't wait 6 hours):
sudo /var/www/download-music-wed/lib/cron/check-cookies.sh
# (Should be silent if cookies are healthy; should ping the webhook if they're not.)
```

`install -m 644` is preferred over `cp` because it sets the exact mode in one
step; `/etc/cron.d/` ignores files with the wrong permissions or with `.` in
the filename.

## Verify it loaded

After the first Monday 04:00 fires (or any subsequent fire):

```bash
# syslog confirms cron read and ran the entry
grep -E "CRON.*wax|pipx|ytmusicapi" /var/log/syslog | tail -10

# pipx/ytmusicapi upgrade output lands here
ls -la /var/log/wax/
tail -20 /var/log/wax/ytmusicapi-upgrade.log
tail -20 /var/log/wax/pipx-upgrade.log
```

To test the schedule without waiting a week, edit the time in
`/etc/cron.d/wax` to `* * * * *` (every minute), wait two minutes, check the
logs, then restore the original schedule.

## Update the schedule

Edit `lib/cron/wax.cron` in this repo, commit, deploy, then re-install:

```bash
sudo install -m 644 /var/www/download-music-wed/lib/cron/wax.cron /etc/cron.d/wax
```

Cron picks up changes on the next minute boundary; no restart needed.

## Uninstall

```bash
sudo rm /etc/cron.d/wax
```

The log files in `/var/log/wax/` stay — remove them separately if you want.

## Why `/etc/cron.d/` and not the root user's crontab?

- **Survives reinstalls and server moves** — the file is in git, so
  re-deploying restores the schedule.
- **No interactive `crontab -e`** — ops can be scripted.
- **Visible in `ls /etc/cron.d/`** — anyone auditing the box sees it
  alongside other scheduled jobs.

## Pre-flight: do the targets exist?

Before installing, confirm the paths the cron expects:

```bash
test -x /var/www/download-music-wed/.venv-ytmusic/bin/pip && echo "venv pip OK" || echo "MISSING — create the venv first"
test -x "$(command -v pipx)" && echo "pipx OK" || echo "MISSING — apt install pipx"
test -d /var/log/wax && echo "log dir OK" || echo "MISSING — sudo mkdir -p /var/log/wax"
```

If any of these say MISSING, the corresponding cron line will fail silently
on its first fire (output goes nowhere because the redirect path is broken).
First-time install instructions are in the deploy README (which is local-only).
