# ReviewBlox

A fan-made Roblox game **review site**: browse a catalog of popular games, read & write
reviews with official Roblox genre tags, see charts, get recommendations, and designate
**Professional Critics**.

- **Live site:** https://lukeyturtle.github.io/reviewblox/
- `index.html` — the whole frontend (single file, no build step).
- `worker/` — optional Cloudflare Worker + D1 backend for **shared** reviews and real critic roles.

## Two modes

| | Local mode (default) | Shared mode |
|---|---|---|
| Reviews | stored per-browser (localStorage) | stored on a server, visible to everyone |
| Critics | badge applies in your browser only | granted by the owner via admin key, global |
| Setup | none — just open the page | deploy the Worker, then set `API_BASE` |

The site works immediately in local mode. To make it a real multi-user site, deploy the backend.

## Features
- **Home** — trending, top-rated, most-played-right-now, latest reviews, quick stats.
- **Browse / search** — **7,600+ Roblox games** (from `games.json`, a snapshot of
  [Rolimons](https://www.rolimons.com)' public game list) with thumbnails, live player
  counts, and direct Roblox links. Filter by any official Roblox tag, sort, and
  **review any game by name** even if it's not listed.
- **Game pages** — aggregate rating, star distribution, and all reviews for that game.
- **Write reviews** — 5-star rating, official Roblox genre/subgenre tags, free text.
- **Charts** — most played, rating distribution, reviews by tag, top-rated games, critics vs community.
- **Trust-based accounts** — sign in with just your Roblox username. Most people type
  `none` as the password (honor system). Pro Critics and the owner have a real password.
- **Owner panel** — the owner (set via `OWNER_USERNAME`) can promote reviewers to
  **Professional Critic** by setting their username + a password to share with them.
- **Recommendations** — from your highly-rated reviews and imported Roblox favorites.

## Config (two places must match)
In **`index.html`**:
```js
const API_BASE = "";                 // "" = local mode; set to your Worker URL for shared mode
const OWNER_USERNAME = "Lukeyturtle"; // <-- set to YOUR Roblox username
```
In **`worker/wrangler.toml`** set the same `OWNER_USERNAME` under `[vars]`.

## Refreshing the game list
```bash
python3 tools/fetch_games.py   # re-snapshots games.json from Rolimons (sorted by live players)
```
Then commit the updated `games.json`.

## Deploy the backend (shared mode)

Requires a free [Cloudflare](https://dash.cloudflare.com/sign-up) account.

```bash
cd worker
npm i -g wrangler        # or: npx wrangler ...
wrangler login

# 1. Create the D1 database and copy the printed database_id into wrangler.toml
wrangler d1 create reviewblox

# 2. Create the tables
wrangler d1 execute reviewblox --remote --file=./schema.sql

# 3. Set an admin key (master key to bootstrap/override critic promotions)
wrangler secret put ADMIN_KEY

# 4. Deploy
wrangler deploy
```

After deploy: **sign in once as the owner** (the `OWNER_USERNAME`) with a password to
claim your account. From then on, your Account page shows the Owner panel, and promoting
a critic is authorized by your owner login. The `ADMIN_KEY` is only a fallback/override.

`wrangler deploy` prints your Worker URL, e.g. `https://reviewblox-api.<you>.workers.dev`.

Then edit `index.html` and set:

```js
const API_BASE = "https://reviewblox-api.<you>.workers.dev";
```

Commit & push — the footer will switch to **shared mode · live** and all reviews become global.

> Note: the "Link Roblox account" feature imports your **public favorites** only. Roblox has
> no public API for games you've *played*, and that part may be CORS-blocked depending on
> Roblox's current headers.

Not affiliated with Roblox Corporation.
