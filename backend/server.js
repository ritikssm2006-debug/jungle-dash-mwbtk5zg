// Accounts + leaderboard for a Prompt2Site game.
// Uses MongoDB when MONGO_URI is set, otherwise keeps data in memory (lost on restart).
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");

const game = (() => { try { return require("./game.json"); } catch { return { engine: "runner" }; } })();
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const PORT = process.env.PORT || 5000;

// Most points a player can plausibly earn per second, per engine (anti-cheat).
const RATE = { runner: 80, racer: 90, flyer: 90, stack: 160, helix: 160, maze: 120, penalty: 120, shooter: 140, snake: 50, quiz: 320, memory: 320 };
const MAX_RATE = RATE[game.engine] || 100;
const MIN_SECONDS = { quiz: 2, memory: 4 }[game.engine] || 3;

// ---------------------------------------------------------------- storage
const mem = { users: new Map(), runs: new Map(), scores: [] };
let db = null;
let Users, Scores;

async function connect() {
  if (!process.env.MONGO_URI) return;
  try {
    const mongoose = require("mongoose");
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    Users = mongoose.model("GameUser", new mongoose.Schema({ username: { type: String, unique: true }, key: { type: String, unique: true }, salt: String, hash: String }, { timestamps: true }));
    Scores = mongoose.model("GameScore", new mongoose.Schema({ userId: String, username: String, score: Number, at: { type: Date, default: Date.now, index: true } }));
    db = mongoose;
    console.log("Connected to MongoDB");
  } catch (e) {
    console.error("MongoDB unavailable, using memory:", e.message);
  }
}

const store = {
  async findUser(key) {
    if (db) return Users.findOne({ key }).lean().then((u) => u && { id: String(u._id), username: u.username, salt: u.salt, hash: u.hash });
    return mem.users.get(key) || null;
  },
  async createUser(u) {
    if (db) { const d = await Users.create(u); return { ...u, id: String(d._id) }; }
    const row = { ...u, id: crypto.randomUUID() };
    mem.users.set(u.key, row);
    return row;
  },
  async addScore(user, score) {
    if (db) return Scores.create({ userId: user.id, username: user.username, score });
    mem.scores.push({ userId: user.id, username: user.username, score, at: new Date() });
  },
  // best score per player, highest first
  async best(since) {
    if (db) {
      const match = since ? { at: { $gte: since } } : {};
      const rows = await Scores.aggregate([{ $match: match }, { $group: { _id: "$userId", username: { $last: "$username" }, score: { $max: "$score" } } }, { $sort: { score: -1 } }, { $limit: 1000 }]);
      return rows.map((r) => ({ userId: r._id, username: r.username, score: r.score }));
    }
    const best = new Map();
    for (const s of mem.scores) if (!since || s.at >= since) { const b = best.get(s.userId); if (!b || s.score > b.score) best.set(s.userId, { userId: s.userId, username: s.username, score: s.score }); }
    return [...best.values()].sort((a, b) => b.score - a.score);
  },
};

// ---------------------------------------------------------------- auth helpers
const b64 = (b) => Buffer.from(b).toString("base64url");
const sign = (payload) => { const body = b64(JSON.stringify(payload)); return `${body}.${crypto.createHmac("sha256", SECRET).update(body).digest("base64url")}`; };
function verify(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
const issue = (u) => ({ token: sign({ id: u.id, name: u.username, exp: Date.now() + 30 * 864e5 }), user: { id: u.id, username: u.username } });
const bad = (res, code, message) => res.status(code).json({ success: false, message });

const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const k = `${req.ip}:${req.path}`;
    const now = Date.now();
    const h = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (h.length >= max) return bad(res, 429, "Too many tries — please wait a few minutes.");
    h.push(now);
    hits.set(k, h);
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3600e3)) hits.delete(k); for (const [k, r] of mem.runs) if (now - r.at > 6 * 3600e3) mem.runs.delete(k); }, 600e3).unref();

function auth(req, res, next) {
  const p = verify((req.headers.authorization || "").replace(/^Bearer /, ""));
  if (!p) return bad(res, 401, "Please log in.");
  req.user = { id: p.id, username: p.name };
  next();
}

// ---------------------------------------------------------------- app
const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "10kb" }));

app.get("/", (_req, res) => res.json({ name: game.title || "Game API", status: "ok" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", database: db ? "mongodb" : "memory", game: game.title || null }));

function credentials(body) {
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return { error: "Username must be 3–20 letters, numbers or _" };
  if (password.length < 6 || password.length > 72) return { error: "Password must be 6–72 characters" };
  return { username, password };
}

app.post("/api/auth/register", limit(12, 10 * 60e3), async (req, res) => {
  try {
    const c = credentials(req.body);
    if (c.error) return bad(res, 400, c.error);
    const key = c.username.toLowerCase();
    if (await store.findUser(key)) return bad(res, 409, "That username is taken");
    const salt = crypto.randomBytes(16).toString("hex");
    const user = await store.createUser({ username: c.username, key, salt, hash: hashPw(c.password, salt) });
    res.status(201).json({ success: true, ...issue(user) });
  } catch (e) {
    if (e.code === 11000) return bad(res, 409, "That username is taken");
    console.error(e);
    bad(res, 500, "Couldn't create the account");
  }
});

app.post("/api/auth/login", limit(30, 10 * 60e3), async (req, res) => {
  try {
    const key = String(req.body?.username || "").trim().toLowerCase();
    const user = await store.findUser(key);
    const pw = String(req.body?.password || "");
    const ok = user && crypto.timingSafeEqual(Buffer.from(hashPw(pw, user.salt)), Buffer.from(user.hash));
    if (!ok) return bad(res, 401, "Wrong username or password");
    res.json({ success: true, ...issue(user) });
  } catch (e) {
    console.error(e);
    bad(res, 500, "Couldn't log in");
  }
});

app.get("/api/auth/me", auth, (req, res) => res.json({ success: true, user: req.user }));

// A run starts when the player presses Play; the score must come back with its run id.
app.post("/api/runs", limit(120, 10 * 60e3), (_req, res) => {
  const id = crypto.randomBytes(12).toString("hex");
  mem.runs.set(id, { at: Date.now() });
  res.json({ success: true, runId: id });
});

app.post("/api/scores", auth, limit(120, 10 * 60e3), async (req, res) => {
  try {
    const score = Math.floor(Number(req.body?.score));
    const run = mem.runs.get(String(req.body?.runId || ""));
    if (!Number.isFinite(score) || score < 0 || score > 5e6) return bad(res, 400, "That score isn't valid");
    if (!run) return bad(res, 400, "That game session has expired");
    mem.runs.delete(String(req.body.runId)); // one score per run
    const seconds = (Date.now() - run.at) / 1000;
    const plausible = seconds >= MIN_SECONDS && score <= MAX_RATE * seconds + 400;
    const rows = await store.best();
    const mine = rows.find((r) => r.userId === req.user.id);
    if (!plausible) return res.json({ success: true, saved: false, best: mine?.score || 0, rank: mine ? rows.indexOf(mine) + 1 : null, note: "Score rejected" });
    if (score > 0) await store.addScore(req.user, score);
    const after = await store.best();
    const me = after.find((r) => r.userId === req.user.id);
    res.json({ success: true, saved: true, best: me?.score || 0, rank: me ? after.indexOf(me) + 1 : null });
  } catch (e) {
    console.error(e);
    bad(res, 500, "Couldn't save the score");
  }
});

app.get("/api/scores/top", async (req, res) => {
  try {
    const since = req.query.range === "week" ? new Date(Date.now() - 7 * 864e5) : null;
    const rows = await store.best(since);
    const out = { success: true, scores: rows.slice(0, 20).map((r) => ({ username: r.username, score: r.score })), me: null };
    const p = verify((req.headers.authorization || "").replace(/^Bearer /, ""));
    if (p) { const i = rows.findIndex((r) => r.userId === p.id); if (i >= 0) out.me = { best: rows[i].score, rank: i + 1 }; }
    res.json(out);
  } catch (e) {
    console.error(e);
    bad(res, 500, "Couldn't load the leaderboard");
  }
});

app.use((_req, res) => bad(res, 404, "Not found"));

connect().finally(() => app.listen(PORT, () => console.log(`Game API on :${PORT}`)));
