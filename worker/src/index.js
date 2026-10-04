// ReviewBlox API — Cloudflare Worker + D1
// Shared reviews + trust-based accounts + owner-managed "Professional Critic" roles.
//
// Bindings (wrangler.toml):
//   DB              : D1 database
//   OWNER_USERNAME  : var — the Roblox username that is the site owner/admin
//   ADMIN_KEY       : secret — master key to bootstrap/override (npx wrangler secret put ADMIN_KEY)
//
// Endpoints:
//   GET    /api/state              -> { reviews:[...], critics:[usernames...] }
//   POST   /api/login              -> { username, critic, owner }  (trust-based; see below)
//   POST   /api/admin/promote      -> set a user's password + critic flag (owner or ADMIN_KEY)
//   POST   /api/reviews            -> create
//   PATCH  /api/reviews/:id        -> edit
//   DELETE /api/reviews/:id        -> delete
//   POST   /api/reviews/:id/like   -> { liked:bool }
//
// Login logic (trust-based honor system):
//   - Unknown username  -> account auto-created, passwordless, logged in.
//   - Passwordless acct -> any password accepted (people type "none").
//   - Account w/ password (critics/owner) -> must match.
//   - owner flag = username === OWNER_USERNAME.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const safeJSON = (s) => { try { return JSON.parse(s) || []; } catch { return []; } };
const rowToReview = (r) => ({ id: r.id, game: r.game, author: r.author, rating: r.rating, genres: safeJSON(r.genres), body: r.body, likes: r.likes, date: r.date, edited: r.edited || undefined, liked: false });

async function sha(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const isOwnerName = (env, n) => String(n || "").toLowerCase() === String(env.OWNER_USERNAME || "").toLowerCase();
const normPw = async (p) => (p && String(p).toLowerCase() !== "none" ? await sha(p) : null);

async function authorizeAdmin(env, b) {
  if (b.adminKey && env.ADMIN_KEY && b.adminKey === env.ADMIN_KEY) return true;
  if (b.ownerUsername && isOwnerName(env, b.ownerUsername)) {
    const acct = await env.DB.prepare("SELECT * FROM accounts WHERE username=?").bind(env.OWNER_USERNAME).first();
    if (!acct || !acct.password) return true; // owner not bootstrapped yet -> trust first owner
    return acct.password === (await sha(b.ownerPassword || ""));
  }
  return false;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "");
    const M = request.method;
    try {
      if (p === "/api/state" && M === "GET") {
        const rev = await env.DB.prepare("SELECT * FROM reviews ORDER BY date DESC").all();
        const cri = await env.DB.prepare("SELECT username FROM accounts WHERE critic=1").all();
        return json({ reviews: (rev.results || []).map(rowToReview), critics: (cri.results || []).map((r) => r.username) });
      }

      if (p === "/api/login" && M === "POST") {
        const b = await request.json();
        const username = String(b.username || "").trim();
        if (!username) return json({ error: "username required" }, 400);
        let acct = await env.DB.prepare("SELECT * FROM accounts WHERE username=?").bind(username).first();
        if (!acct) {
          const pw = await normPw(b.password);
          const critic = isOwnerName(env, username) ? 1 : 0;
          await env.DB.prepare("INSERT INTO accounts (username,password,critic) VALUES (?,?,?)").bind(username, pw, critic).run();
          acct = { username, password: pw, critic };
        } else if (acct.password) {
          if (acct.password !== (await sha(b.password || ""))) return json({ error: "Wrong password." }, 401);
        }
        return json({ username: acct.username, critic: !!acct.critic || isOwnerName(env, username), owner: isOwnerName(env, username) });
      }

      if (p === "/api/admin/promote" && M === "POST") {
        const b = await request.json();
        if (!(await authorizeAdmin(env, b))) return json({ error: "unauthorized (owner password or admin key required)" }, 401);
        const target = String(b.username || "").trim();
        if (!target) return json({ error: "username required" }, 400);
        const pw = await normPw(b.password);
        const critic = b.critic === false ? 0 : 1;
        const existing = await env.DB.prepare("SELECT username FROM accounts WHERE username=?").bind(target).first();
        if (existing) {
          // keep existing password if caller passed "none"/empty while only toggling critic off
          if (pw === null && b.critic === false) {
            await env.DB.prepare("UPDATE accounts SET critic=0 WHERE username=?").bind(target).run();
          } else {
            await env.DB.prepare("UPDATE accounts SET password=?,critic=? WHERE username=?").bind(pw, critic, target).run();
          }
        } else {
          await env.DB.prepare("INSERT INTO accounts (username,password,critic) VALUES (?,?,?)").bind(target, pw, critic).run();
        }
        return json({ ok: true, username: target, critic: !!critic });
      }

      if (p === "/api/reviews" && M === "POST") {
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
        await env.DB.prepare("INSERT INTO reviews (id,game,author,rating,genres,body,likes,date) VALUES (?,?,?,?,?,?,?,?)")
          .bind(row.id, row.game, row.author, row.rating, row.genres, row.body, row.likes, row.date).run();
        return json(rowToReview(row));
      }

      const mId = p.match(/^\/api\/reviews\/([^/]+)$/);
      if (mId && M === "PATCH") {
        const b = await request.json();
        const cur = await env.DB.prepare("SELECT * FROM reviews WHERE id=?").bind(mId[1]).first();
        if (!cur) return json({ error: "not found" }, 404);
        const game = b.game != null ? String(b.game).slice(0, 120) : cur.game;
        const rating = b.rating != null ? Math.max(1, Math.min(5, parseInt(b.rating))) : cur.rating;
        const genres = b.genres != null ? JSON.stringify(b.genres.slice(0, 20)) : cur.genres;
        const body = b.body != null ? String(b.body).slice(0, 4000) : cur.body;
        await env.DB.prepare("UPDATE reviews SET game=?,rating=?,genres=?,body=?,edited=? WHERE id=?")
          .bind(game, rating, genres, body, Date.now(), mId[1]).run();
        return json({ ok: true });
      }
      if (mId && M === "DELETE") { await env.DB.prepare("DELETE FROM reviews WHERE id=?").bind(mId[1]).run(); return json({ ok: true }); }

      const mLike = p.match(/^\/api\/reviews\/([^/]+)\/like$/);
      if (mLike && M === "POST") {
        const b = await request.json().catch(() => ({}));
        await env.DB.prepare("UPDATE reviews SET likes = MAX(0, likes + ?) WHERE id=?").bind(b.liked === false ? -1 : 1, mLike[1]).run();
        return json({ ok: true });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};
