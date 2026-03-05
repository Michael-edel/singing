// Cloudflare Worker: serves SPA assets + API (Google/Apple login + leaderboard) 
// Bindings expected:
// - ASSETS (static assets)
// - DB (D1 database)
// - SESSION_SECRET (text)  -> set in wrangler.toml / dashboard

const encoder = new TextEncoder();

function base64url(bytes) {
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function fromBase64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(sig);
}

async function makeSession(secret, payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = base64url(encoder.encode(JSON.stringify(header)));
  const p = base64url(encoder.encode(JSON.stringify(payload)));
  const msg = `${h}.${p}`;
  const sig = base64url(await hmacSign(secret, msg));
  return `${msg}.${sig}`;
}
async function verifySession(secret, token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const msg = `${h}.${p}`;
  const expected = base64url(await hmacSign(secret, msg));
  if (expected !== s) return null;
  const payload = JSON.parse(new TextDecoder().decode(fromBase64url(p)));
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload;
}

const JWKS_CACHE = new Map(); // url -> { keys, ts }

async function getJwks(url) {
  const cached = JWKS_CACHE.get(url);
  if (cached && (Date.now() - cached.ts) < 60 * 60 * 1000) return cached.keys;
  const r = await fetch(url);
  if (!r.ok) throw new Error("JWKS fetch failed");
  const data = await r.json();
  JWKS_CACHE.set(url, { keys: data.keys, ts: Date.now() });
  return data.keys;
}

function bufToStr(buf) { return new TextDecoder().decode(buf); }

async function importJwkToKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

async function verifyJwtRS256(token, jwksUrl, { iss, aud }) {
  const [h, p, s] = token.split(".");
  if (!s) throw new Error("bad jwt");
  const header = JSON.parse(bufToStr(fromBase64url(h)));
  const payload = JSON.parse(bufToStr(fromBase64url(p)));
  if (iss && payload.iss !== iss) throw new Error("bad iss");
  if (aud) {
    const a = payload.aud;
    const ok = Array.isArray(a) ? a.includes(aud) : a === aud;
    if (!ok) throw new Error("bad aud");
  }
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error("expired");
  const keys = await getJwks(jwksUrl);
  const jwk = keys.find(k => k.kid === header.kid) || keys[0];
  if (!jwk) throw new Error("no jwk");
  const key = await importJwkToKey(jwk);
  const data = encoder.encode(`${h}.${p}`);
  const sig = fromBase64url(s);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!ok) throw new Error("bad sig");
  return payload;
}

function json(res, status=200, headers={}) {
  return new Response(JSON.stringify(res), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers }});
}

function getCookie(req, name) {
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(headers, name, value, opts={}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push("Path=/");
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.secure !== false) parts.push("Secure");
  headers.append("Set-Cookie", parts.join("; "));
}

async function ensureTables(env) {
  // no-op at runtime; migrations should create tables
  return;
}

async function upsertUser(env, { provider, sub, email, name, avatar }) {
  const id = `${provider}:${sub}`;
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar, provider, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, avatar=excluded.avatar`
  ).bind(id, email || null, name || null, avatar || null, provider, Date.now()).run();
  return { id, email, name, avatar, provider };
}

async function requireUser(req, env) {
  const token = getCookie(req, "mv_session");
  if (!token) return null;
  const payload = await verifySession(env.SESSION_SECRET, token);
  if (!payload?.uid) return null;
  return payload;
}

export default {
  async fetch(request, env, ctx) {
    await ensureTables(env);

    const url = new URL(request.url);
    const path = url.pathname;

    // API routes

    if (path === "/api/config" && request.method === "GET") {
      const origin = url.origin;
      return json({
        googleClientId: env.GOOGLE_CLIENT_ID || env.googleClientId || null,
        appleClientId: env.APPLE_CLIENT_ID || env.appleClientId || null,
        appleRedirectUri: env.APPLE_REDIRECT_URI || env.appleRedirectUri || origin,
      });
    }

    if (path === "/api/me" && request.method === "GET") {
      const sess = await requireUser(request, env);
      if (!sess) return json({ user: null });
      const row = await env.DB.prepare("SELECT id, email, name, avatar, provider FROM users WHERE id=?1").bind(sess.uid).first();
      return json({ user: row || null });
    }

    if (path === "/api/logout" && request.method === "POST") {
      const headers = new Headers();
      setCookie(headers, "mv_session", "", { maxAge: 0 });
      return json({ ok: true }, 200, Object.fromEntries(headers.entries()));
    }

    if (path === "/api/login/google" && request.method === "POST") {
      const { credential } = await request.json();
      if (!credential) return json({ error: "missing credential" }, 400);

      const aud = env.GOOGLE_CLIENT_ID || null;
      if (!aud) return json({ error: "Missing GOOGLE_CLIENT_ID in env" }, 500);

      const payload = await verifyJwtRS256(
        credential,
        "https://www.googleapis.com/oauth2/v3/certs",
        { iss: "https://accounts.google.com", aud }
      );

      const user = await upsertUser(env, {
        provider: "google",
        sub: payload.sub,
        email: payload.email,
        name: payload.name || payload.given_name || payload.email,
        avatar: payload.picture || null
      });

      const headers = new Headers();
      const session = await makeSession(env.SESSION_SECRET, {
        uid: user.id,
        exp: Math.floor(Date.now()/1000) + 60*60*24*14
      });
      setCookie(headers, "mv_session", session, { maxAge: 60*60*24*14 });

      return json({ user }, 200, Object.fromEntries(headers.entries()));
    }

    if (path === "/api/login/apple" && request.method === "POST") {
      const { id_token } = await request.json();
      if (!id_token) return json({ error: "missing id_token" }, 400);

      const aud = env.APPLE_CLIENT_ID || null;
      if (!aud) return json({ error: "Missing APPLE_CLIENT_ID in env" }, 500);

      const payload = await verifyJwtRS256(
        id_token,
        "https://appleid.apple.com/auth/keys",
        { iss: "https://appleid.apple.com", aud }
      );

      const user = await upsertUser(env, {
        provider: "apple",
        sub: payload.sub,
        email: payload.email,
        name: payload.email || "Apple User",
        avatar: null
      });

      const headers = new Headers();
      const session = await makeSession(env.SESSION_SECRET, {
        uid: user.id,
        exp: Math.floor(Date.now()/1000) + 60*60*24*14
      });
      setCookie(headers, "mv_session", session, { maxAge: 60*60*24*14 });

      return json({ user }, 200, Object.fromEntries(headers.entries()));
    }

    if (path === "/api/score" && request.method === "POST") {
      const sess = await requireUser(request, env);
      if (!sess) return json({ error: "unauthorized" }, 401);
      const body = await request.json();
      const score = Math.max(0, Math.min(10000, Math.floor(body.score ?? 0)));
      const accuracy = Math.max(0, Math.min(1, Number(body.accuracy ?? 0)));
      await env.DB.prepare(
        "INSERT INTO scores (user_id, score, accuracy, created_at) VALUES (?1, ?2, ?3, ?4)"
      ).bind(sess.uid, score, accuracy, Date.now()).run();
      return json({ ok: true });
    }

    if (path === "/api/leaderboard" && request.method === "GET") {
      const res = await env.DB.prepare(
        `WITH best AS (
          SELECT user_id, MAX(score) AS best_score, MAX(created_at) AS last_played_at
          FROM scores
          GROUP BY user_id
        )
        SELECT u.id as user_id, u.name, u.avatar, b.best_score, b.last_played_at
        FROM best b
        JOIN users u ON u.id = b.user_id
        ORDER BY b.best_score DESC
        LIMIT 50`
      ).all();
      const rows = (res.results || []).map((r, i) => ({ rank: i+1, ...r }));
      return json({ rows });
    }

    // Static assets (SPA)
    // fallback to index.html for SPA routes handled by assets config
    return env.ASSETS.fetch(request);
  }
};
