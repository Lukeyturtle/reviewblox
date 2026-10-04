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
- **Home** — trending, top-rated, latest reviews, quick stats.
- **Browse / search** — ~110-game catalog, filter by any official Roblox tag, sort, and
  **review any game by name** even if it's not in the catalog.
- **Game pages** — aggregate rating, star distribution, and all reviews for that game.
- **Write reviews** — 5-star rating, official Roblox genre/subgenre tags, free text.
- **Charts** — rating distribution, reviews by tag, top-rated games, critics vs community.
- **Professional Critics** — verified badge + extra weight in recommendations.
- **Recommendations** — from your highly-rated reviews and imported Roblox favorites.

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

# 3. Set an admin key (used to promote/remove Professional Critics)
wrangler secret put ADMIN_KEY

# 4. Deploy
wrangler deploy
```

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
