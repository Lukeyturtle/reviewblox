// ReviewBlox API — Cloudflare Worker + D1
// Shared reviews + admin-gated "professional critic" roles.
//
// Bindings (see wrangler.toml):
//   DB         : D1 database
//   ADMIN_KEY  : secret string; required to add/remove critics
//
// Endpoints:
//   GET    /api/state                 -> { reviews:[...], critics:[...] }
//   POST   /api/reviews               -> create review (returns the saved row)
//   PATCH  /api/reviews/:id           -> edit review
//   DELETE /api/reviews/:id           -> delete review
//   POST   /api/reviews/:id/like      -> { liked:true|false } increments/decrements likes
//   PUT    /api/critics               -> { critics:[...], adminKey } replace critic list (admin only)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS } });

function rowToReview(r) {
  return {
    id: r.id, game: r.game, author: r.author, rating: r.rating,
    genres: safeJSON(r.genres), body: r.body, likes: r.likes,
    date: r.date, edited: r.edited || undefined, liked: false,
  };
}
function safeJSON(s) { try { return JSON.parse(s) || []; } catch { return []; } }

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "");
    try {
      if (p === "/api/state" && request.method === "GET") {
        const rev = await env.DB.prepare("SELECT * FROM reviews ORDER BY date DESC").all();
        const cri = await env.DB.prepare("SELECT name FROM critics").all();
        return json({
          reviews: (rev.results || []).map(rowToReview),
          critics: (cri.results || []).map(r => r.name),
        });
      }

      if (p === "/api/reviews" && request.method === "POST") {
        const b = await request.json();
        if (!b.game || !b.rating) return json({ error: "game and rating required" }, 400);
        const row = {
          id: b.id || crypto.randomUUID(),
          game: String(b.game).slice(0, 120),
          author: String(b.author || "Anonymous").slice(0, 40),
          rating: Math.max(1, Math.min(5, parseInt(b.rating))),
          genres: JSON.stringify(Array.isArray(b.genres) ? b.genres.slice(0, 20) : []),
          body: String(b.body || "").slice(0, 4000),
          likes: 0,
          date: b.date || Date.now(),
        };
        await env.DB.prepare(
          "INSERT INTO reviews (id,game,author,rating,genres,body,likes,date) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(row.id, row.game, row.author, row.rating, row.genres, row.body, row.likes, row.date).run();
        return json(rowToReview(row));
      }

      const mId = p.match(/^\/api\/reviews\/([^/]+)$/);
      if (mId && request.method === "PATCH") {
        const b = await request.json();
        const cur = await env.DB.prepare("SELECT * FROM reviews WHERE id=?").bind(mId[1]).first();
        if (!cur) return json({ error: "not found" }, 404);
        const game = b.game != null ? String(b.game).slice(0, 120) : cur.game;
        const author = b.author != null ? String(b.author).slice(0, 40) : cur.author;
        const rating = b.rating != null ? Math.max(1, Math.min(5, parseInt(b.rating))) : cur.rating;
        const genres = b.genres != null ? JSON.stringify(b.genres.slice(0, 20)) : cur.genres;
        const body = b.body != null ? String(b.body).slice(0, 4000) : cur.body;
        await env.DB.prepare(
          "UPDATE reviews SET game=?,author=?,rating=?,genres=?,body=?,edited=? WHERE id=?"
        ).bind(game, author, rating, genres, body, Date.now(), mId[1]).run();
        return json({ ok: true });
      }
      if (mId && request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM reviews WHERE id=?").bind(mId[1]).run();
        return json({ ok: true });
      }

      const mLike = p.match(/^\/api\/reviews\/([^/]+)\/like$/);
      if (mLike && request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const delta = b.liked === false ? -1 : 1;
        await env.DB.prepare("UPDATE reviews SET likes = MAX(0, likes + ?) WHERE id=?").bind(delta, mLike[1]).run();
        return json({ ok: true });
      }

      if (p === "/api/critics" && request.method === "PUT") {
        const b = await request.json();
        if (!env.ADMIN_KEY || b.adminKey !== env.ADMIN_KEY) return json({ error: "unauthorized" }, 401);
        const list = (Array.isArray(b.critics) ? b.critics : []).map(s => String(s).slice(0, 40)).filter(Boolean);
        await env.DB.prepare("DELETE FROM critics").run();
        for (const name of list) {
          await env.DB.prepare("INSERT OR IGNORE INTO critics (name) VALUES (?)").bind(name).run();
        }
        return json({ ok: true, critics: list });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 500);
    }
  },
};
