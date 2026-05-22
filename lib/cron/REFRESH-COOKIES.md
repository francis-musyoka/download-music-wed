# Refreshing yt-dlp cookies

When the 6-hourly `check-cookies.sh` cron pings your Discord channel with
"⚠️ WaxMusic cookies expired…", follow this. End-to-end takes ~90 seconds of
active time.

## Prereqs (one-time setup, already done — don't redo)

- Chrome profile **"Wax"** (Profile 15 on disk) signed into `musicwax0@gmail.com`
- **Get cookies.txt LOCALLY** extension pinned in that profile's toolbar
- Deno + `yt-dlp` + the EJS solver fetch (`--remote-components ejs:github`)
  installed/cached on both laptop and VPS
- `~/refresh-cookies.sh` (optional helper script — see bottom of this file)

If any of those are missing, see `lib/cron/README.md` and the original deploy
docs first.

---

## The 4-step refresh

### 1. Export fresh cookies from the Wax Chrome profile

1. Open Chrome → click profile avatar → switch to **Wax**
2. Visit `https://music.youtube.com/` — confirm the avatar in the top-right
   shows the throwaway account is signed in. **If signed out, sign back in;
   that re-rotates and dies again — don't sign out in the first place.**
3. Click the **Get cookies.txt LOCALLY** icon in the toolbar → **Export**
4. Browser saves something like `music.youtube.com_cookies.txt` to `~/Downloads/`

### 2. Verify locally before shipping

```bash
mv ~/Downloads/*youtube*cookies.txt ~/cookies.txt
chmod 600 ~/cookies.txt

# Real download test — should produce an MP3 and no "Sign in to confirm" line
yt-dlp --cookies ~/cookies.txt \
       --remote-components ejs:github \
       -x --audio-format mp3 \
       -o "/tmp/cookie-test.%(ext)s" \
       "https://www.youtube.com/watch?v=GodmYPfMaio" 2>&1 | tail -10

ls -la /tmp/cookie-test.mp3 && rm /tmp/cookie-test.mp3
```

Pass criteria: an `[ExtractAudio] Destination: /tmp/cookie-test.mp3` line and
a file >1 MB on disk. **Don't ship if this fails** — fix locally first.

If you see "Sign in to confirm" here too, the cookies died between export and
test — close Chrome (`pkill -9 chrome`), wait a few seconds, re-open the Wax
profile, re-visit YouTube Music, re-export. See "Troubleshooting" below.

### 3. Ship to the VPS

```bash
scp ~/cookies.txt root@167.86.70.136:/var/www/download-music-wed/cookies.txt
ssh -t root@167.86.70.136 'chmod 600 /var/www/download-music-wed/cookies.txt && pm2 restart wax && pm2 list | grep wax'
```

(`ssh -t` forces a login shell so `pm2` is on PATH. Without `-t` you'll get
`pm2: command not found`.)

You should see the `wax` process show `online` with low uptime.

### 4. Confirm on the VPS

```bash
ssh root@167.86.70.136
cd /var/www/download-music-wed
./lib/cron/check-cookies.sh && echo "ok"
```

`ok` means the script ran cleanly and didn't trip the bot-wall grep — the
cookies are good. Your Discord channel won't get another alert this 6-hour
window.

The next scheduled check at `00 */6 * * *` UTC (so 00:00 / 06:00 / 12:00 /
18:00 UTC) will verify the same thing automatically and stay silent.

---

## Troubleshooting

### "Sign in to confirm you're not a bot" right after export

Chrome rotated the cookies as a security response to a background sync. Fix:

```bash
# Fully kill anything Chrome-related (including background helpers)
pkill -9 chrome chromium 2>/dev/null
sleep 2
pgrep -a chrome           # should print nothing
```

Then re-do step 1 — open the Wax profile *fresh*, visit YouTube Music, click
the extension immediately. **Do not** "yt-dlp --cookies-from-browser
chrome:..." — that pathway re-triggers Chrome's App-Bound Encryption
rotation. Always use the browser extension.

### `pm2: command not found` over SSH

You missed the `-t` flag in `ssh -t root@...`. SSH-with-a-command uses a
non-login shell that doesn't source nvm's PATH. The `-t` forces a login
shell.

### Local test passes but VPS download still fails

Confirm the VPS has Deno on PATH:

```bash
ssh root@167.86.70.136 'command -v deno'
```

If empty: `curl -fsSL https://deno.land/install.sh | sh && ln -sf /root/.deno/bin/deno /usr/local/bin/deno`

### The Discord alert keeps firing after the refresh

It runs every 6 hours. If you refreshed at 13:30, the next scheduled tick is
18:00 UTC — that's when alerts stop. To force an immediate check:

```bash
ssh root@167.86.70.136 'cd /var/www/download-music-wed && ./lib/cron/check-cookies.sh'
```

If THAT still pings Discord, the cookies on the VPS aren't actually what you
shipped — check `ls -la /var/www/download-music-wed/cookies.txt` timestamp.

### `cookies.txt` is on the VPS but downloads still get "Sign in to confirm"

YT_DLP_COOKIES env var isn't being passed to the orchestrator's spawned
yt-dlp. Re-read .env was loaded:

```bash
ssh root@167.86.70.136 'grep YT_DLP_COOKIES /var/www/download-music-wed/.env'
# Should print: YT_DLP_COOKIES=/var/www/download-music-wed/cookies.txt
# If missing, see deploy notes.
```

---

## Optional: one-command laptop helper

Save this at `~/bin/refresh-wax-cookies.sh` (untracked, machine-specific).
Once you've exported via the Chrome extension, this does steps 2–4 in one
shot:

```bash
#!/bin/bash
# ~/bin/refresh-wax-cookies.sh
# Assumes the Chrome extension has just exported cookies to ~/Downloads/.
set -e

EXPORTED=$(ls -t ~/Downloads/*youtube*cookies.txt 2>/dev/null | head -1)
[ -z "$EXPORTED" ] && { echo "No exported cookies in ~/Downloads/"; exit 1; }

mv "$EXPORTED" ~/cookies.txt
chmod 600 ~/cookies.txt
echo "→ Local sanity test..."
yt-dlp --cookies ~/cookies.txt --remote-components ejs:github \
       --skip-download --no-warnings \
       "https://www.youtube.com/watch?v=GodmYPfMaio" 2>&1 \
  | grep -E "ERROR|Sign in to confirm" \
  && { echo "❌ Cookies failed local test — aborting ship"; exit 1; }

echo "→ Shipping to VPS..."
scp ~/cookies.txt root@167.86.70.136:/var/www/download-music-wed/cookies.txt
ssh -t root@167.86.70.136 'chmod 600 /var/www/download-music-wed/cookies.txt && pm2 restart wax && /var/www/download-music-wed/lib/cron/check-cookies.sh && echo "✓ VPS check clean"'
echo "✓ Refresh done"
```

Then:

```bash
chmod +x ~/bin/refresh-wax-cookies.sh
# After clicking the extension's Export:
~/bin/refresh-wax-cookies.sh
```

---

## Frequency

Cookies live ~1–4 weeks per Google's session-token lifetime. Don't preemptively
refresh — wait for the Discord alert. Excessive refreshes can themselves
trigger Google's "unusual activity" flags on the throwaway account.
