#!/usr/bin/env python3
"""
CLI wrapper around ytmusicapi for the Node side.

Usage:
  ytmusic_search.py search <query> <filter> <limit>

  e.g.  ytmusic_search.py search "afrobeats" songs 200

Output:
  JSON array of normalised song dicts on stdout (one line):
    [{ "videoId", "title", "artist", "artists",
       "album_id", "album_name", "duration_seconds",
       "views" (parsed int), "position" }, ...]

Exit codes:
  0  success (even if zero results)
  2  bad CLI usage
  3  ytmusicapi error (stderr has diagnostic)
"""

import json
import re
import sys
import traceback

try:
    from ytmusicapi import YTMusic
except ImportError:
    print("ytmusicapi not installed in this Python interpreter", file=sys.stderr)
    sys.exit(3)


_VIEW_RE = re.compile(r"([\d.]+)\s*(b|m|k)?", re.IGNORECASE)


def parse_views(s):
    """Parse '24M', '1.2B', '15K', '500' → int. Returns 0 if unparseable."""
    if not s:
        return 0
    m = _VIEW_RE.match(str(s).strip().lower())
    if not m:
        return 0
    n = float(m.group(1))
    unit = m.group(2)
    if unit == "b":
        return int(n * 1_000_000_000)
    if unit == "m":
        return int(n * 1_000_000)
    if unit == "k":
        return int(n * 1_000)
    return int(n)


def normalise(result, position):
    """Map a ytmusicapi search result to the Node-side shape."""
    album = result.get("album") or {}
    artists = result.get("artists") or []
    primary = (artists[0] if artists else {}).get("name", "Unknown")
    return {
        "videoId": result.get("videoId"),
        "title": result.get("title", ""),
        "artist": primary,
        "artists": [a.get("name", "") for a in artists],
        "album_id": album.get("id"),
        "album_name": album.get("name"),
        "duration_seconds": result.get("duration_seconds") or 0,
        "views": parse_views(result.get("views")),
        "position": position,
    }


def cmd_search(argv):
    if len(argv) != 3:
        print(
            "usage: ytmusic_search.py search <query> <filter> <limit>",
            file=sys.stderr,
        )
        sys.exit(2)
    query, filter_, limit_str = argv
    try:
        limit = int(limit_str)
    except ValueError:
        print(f"limit must be an integer, got: {limit_str!r}", file=sys.stderr)
        sys.exit(2)
    if filter_ not in {"songs", "videos", "albums", "artists", "playlists"}:
        print(f"unsupported filter: {filter_!r}", file=sys.stderr)
        sys.exit(2)

    yt = YTMusic()
    try:
        results = yt.search(query, filter=filter_, limit=limit)
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(3)

    out = [normalise(r, i) for i, r in enumerate(results)]
    json.dump(out, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    sys.stdout.flush()


def main():
    if len(sys.argv) < 2:
        print("usage: ytmusic_search.py <command> [args…]", file=sys.stderr)
        sys.exit(2)
    cmd, *rest = sys.argv[1:]
    if cmd == "search":
        cmd_search(rest)
    else:
        print(f"unknown command: {cmd!r}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
