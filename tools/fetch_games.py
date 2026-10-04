#!/usr/bin/env python3
"""Refresh games.json from the Rolimons public game list.

Usage:  python3 tools/fetch_games.py
Then commit the updated games.json. The list is sorted by current players (CCU).
Rolimons only allows CORS from its own site, so we snapshot it server-side here
instead of fetching from the browser.
"""
import json, datetime, urllib.request, os

URL = "https://api.rolimons.com/games/v1/gamelist"
OUT = os.path.join(os.path.dirname(__file__), "..", "games.json")

def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "ReviewBlox/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    games = d["games"]  # { id: [name, ccu, thumb] }
    rows = [[int(k), v[0], v[1], v[2]] for k, v in games.items()]
    rows.sort(key=lambda r: -r[2])
    out = {
        "date": datetime.date.today().isoformat(),
        "source": URL,
        "count": len(rows),
        "games": rows,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {len(rows)} games to games.json")

if __name__ == "__main__":
    main()
