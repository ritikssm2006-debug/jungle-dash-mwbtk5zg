// The game shell: menus, HUD, input, sound, accounts and the leaderboard.
// Each game type lives in engines/<engine>.js and gets the same `ctx`.
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const PREVIEW = params.has("preview") || !window.GAME_API;
let CFG = window.GAME_CONFIG || null;

// ------------------------------------------------------------------ API
const TOKEN_KEY = "game_token";
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function serverApi(base) {
  const call = async (method, path, body) => {
    const token = store.get(TOKEN_KEY);
    const res = await fetch(base.replace(/\/$/, "") + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token && path !== "/api/auth/login") store.set(TOKEN_KEY, null);
    if (!res.ok) throw new Error(data.message || "Something went wrong. Please try again.");
    return data;
  };
  return {
    me: () => (store.get(TOKEN_KEY) ? call("GET", "/api/auth/me").then((d) => d.user).catch(() => null) : Promise.resolve(null)),
    login: (username, password) => call("POST", "/api/auth/login", { username, password }).then((d) => (store.set(TOKEN_KEY, d.token), d.user)),
    register: (username, password) => call("POST", "/api/auth/register", { username, password }).then((d) => (store.set(TOKEN_KEY, d.token), d.user)),
    logout: () => store.set(TOKEN_KEY, null),
    startRun: () => call("POST", "/api/runs").then((d) => d.runId).catch(() => null),
    submit: (runId, score) => call("POST", "/api/scores", { runId, score }),
    top: (range) => call("GET", `/api/scores/top?range=${range}`),
  };
}

/** Preview: everything stays in this page, with a few made-up players. */
function localApi() {
  const names = ["Riya", "Kabir", "Ananya", "Arjun", "Meera", "Vikram", "Zoya"];
  let users = {};
  let me = null;
  const scores = () => {
    const base = Math.max(50, Math.round((CFG?.sampleTop || 900)));
    return names.map((n, i) => ({ username: n, score: Math.round(base * (1 - i * 0.12)) }));
  };
  const mine = [];
  return {
    me: async () => me,
    login: async (u, p) => {
      if (!users[u.toLowerCase()] || users[u.toLowerCase()] !== p) throw new Error("Wrong player name or password.");
      return (me = { username: u });
    },
    register: async (u, p) => {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(u)) throw new Error("Player name: 3–16 letters, numbers or _.");
      if (String(p).length < 6) throw new Error("Password: at least 6 characters.");
      users[u.toLowerCase()] = p;
      return (me = { username: u });
    },
    logout: () => { me = null; },
    startRun: async () => "preview",
    submit: async (_r, score) => {
      mine.push(score);
      const all = [...scores(), { username: me.username, score: Math.max(...mine) }].sort((a, b) => b.score - a.score);
      return { best: Math.max(...mine), rank: all.findIndex((s) => s.username === me.username) + 1, saved: true };
    },
    top: async () => {
      const all = scores();
      if (me && mine.length) all.push({ username: me.username, score: Math.max(...mine) });
      all.sort((a, b) => b.score - a.score);
      return { scores: all.slice(0, 20), me: me && mine.length ? { best: Math.max(...mine), rank: all.findIndex((s) => s.username === me.username) + 1 } : null };
    },
  };
}

const api = PREVIEW ? localApi() : serverApi(window.GAME_API);
let user = null;

// ------------------------------------------------------------------ sound
const sfx = (() => {
  let ac = null;
  let muted = false;
  const tones = {
    coin: [[880, 0.06], [1320, 0.08]],
    jump: [[420, 0.05], [620, 0.07]],
    hit: [[160, 0.14, "sawtooth"], [90, 0.2, "sawtooth"]],
    win: [[660, 0.08], [880, 0.08], [1100, 0.14]],
    lose: [[440, 0.12], [330, 0.12], [220, 0.22]],
    click: [[600, 0.03]],
    shoot: [[900, 0.04, "square"], [500, 0.05, "square"]],
    right: [[720, 0.07], [1080, 0.1]],
    wrong: [[200, 0.16, "triangle"]],
  };
  return {
    set muted(v) { muted = v; },
    play(name) {
      if (muted || !CFG?.sound) return;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        let t = ac.currentTime;
        for (const [f, d, type] of tones[name] || tones.click) {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = type || "sine";
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          o.connect(g).connect(ac.destination);
          o.start(t);
          o.stop(t + d + 0.02);
          t += d * 0.9;
        }
      } catch { /* no audio */ }
    },
  };
})();

// ------------------------------------------------------------------ input
function makeInput() {
  const handlers = {};
  const keys = new Set();
  const pointer = { x: 0, y: 0, down: false, cx: 0, cy: 0 };
  const emit = (t, ...a) => (handlers[t] || []).forEach((f) => f(...a));
  const KEYMAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", Space: "action", Enter: "action" };
  const onKey = (e) => {
    const k = KEYMAP[e.code];
    if (!k || e.target?.tagName === "INPUT") return;
    e.preventDefault();
    if (e.type === "keydown") {
      if (!keys.has(k)) emit(k);
      keys.add(k);
      if (k === "up" || k === "action") emit("jump");
    } else keys.delete(k);
  };
  let start = null;
  const norm = (e) => {
    pointer.cx = e.clientX;
    pointer.cy = e.clientY;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  const stage = $("stage");
  const down = (e) => {
    if (e.target.closest("button, .screen, .layer")) return;
    norm(e);
    pointer.down = true;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX, ly: e.clientY };
    emit("press", pointer);
  };
  const move = (e) => {
    norm(e);
    if (!start) return emit("hover", pointer);
    emit("drag", e.clientX - start.lx, e.clientY - start.ly, pointer);
    start.lx = e.clientX;
    start.ly = e.clientY;
  };
  const up = (e) => {
    if (!start) return;
    norm(e);
    pointer.down = false;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const fast = performance.now() - start.t < 600;
    if (Math.hypot(dx, dy) > 34 && fast) {
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      emit(dir);
      if (dir === "up") emit("jump");
    } else if (Math.hypot(dx, dy) < 12) {
      emit("tap", pointer);
    }
    emit("release", pointer);
    start = null;
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  return {
    keys,
    pointer,
    on(t, f) { (handlers[t] = handlers[t] || []).push(f); },
    held: (k) => keys.has(k),
    destroy() {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      keys.clear();
    },
  };
}

// ------------------------------------------------------------------ HUD
let toastTimer;
const hud = {
  set({ score, lives, extra, extraLabel } = {}) {
    if (score !== undefined) $("score").textContent = Math.floor(score).toLocaleString();
    if (lives !== undefined) {
      const max = CFG.lives || 3;
      const el = $("lives");
      el.replaceChildren(...Array.from({ length: max }, (_, i) => {
        const s = document.createElement("span");
        s.textContent = "❤";
        s.style.color = "#ff5d7a";
        if (i >= lives) s.className = "off";
        return s;
      }));
    }
    if (extra !== undefined) {
      $("extraWrap").hidden = extra === null;
      $("extra").textContent = extra ?? "";
      if (extraLabel) $("extraLabel").textContent = extraLabel;
    }
  },
  toast(text, ms = 900) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), ms);
  },
};

// ------------------------------------------------------------------ game loop
let game = null; // { engine instance, input, raf, paused, runId, started }
const show = (id) => ["startScreen", "overScreen", "pauseScreen"].forEach((s) => ($(s).hidden = s !== id));
const best = () => Number(store.get(`best_${CFG?.id || "game"}`) || 0);

async function loadEngine(name) {
  return (await import(`./engines/${name}.js`)).default;
}

async function play() {
  sfx.play("click");
  stopGame();
  show(null);
  $("hud").hidden = false;
  const engine = await loadEngine(CFG.engine);
  const input = makeInput();
  const stage = $("stage");
  stage.replaceChildren();
  const g = { input, paused: false, over: false, runId: null, startedAt: performance.now(), raf: 0, tick: null };
  game = g;
  api.startRun().then((id) => (g.runId = id));
  hud.set({ score: 0, lives: CFG.usesLives === false ? undefined : CFG.lives, extra: null });
  $("lives").hidden = CFG.usesLives === false;
  let last = performance.now();
  const frame = (t) => {
    if (game !== g) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!g.paused && g.tick) g.tick(dt);
    g.raf = requestAnimationFrame(frame);
  };
  const ctx = {
    root: stage,
    cfg: CFG,
    hud,
    input,
    sfx,
    loop: (fn) => (g.tick = fn),
    isPaused: () => g.paused,
    done: (score, opts = {}) => {
      if (g.over || game !== g) return;
      g.over = true;
      setTimeout(() => finish(g, Math.max(0, Math.floor(score)), opts), opts.delay ?? 700);
    },
  };
  try {
    g.instance = engine(ctx);
  } catch (err) {
    console.error(err);
    hud.toast("This game couldn't start on this device", 3000);
  }
  g.raf = requestAnimationFrame(frame);
}

function stopGame() {
  if (!game) return;
  cancelAnimationFrame(game.raf);
  game.instance?.destroy?.();
  game.input.destroy();
  $("stage").replaceChildren();
  game = null;
}

function setPaused(p) {
  if (!game || game.over) return;
  game.paused = p;
  $("pauseScreen").hidden = !p;
}

async function finish(g, score, { won } = {}) {
  if (game !== g) return;
  sfx.play(won ? "win" : "lose");
  const prev = best();
  if (score > prev) store.set(`best_${CFG.id || "game"}`, String(score));
  $("overKicker").textContent = won ? "You did it!" : "Game over";
  $("finalScore").textContent = score.toLocaleString();
  $("bestLine").textContent = score > prev && prev > 0 ? "New personal best!" : `Your best: ${Math.max(score, prev).toLocaleString()}`;
  const save = $("saveLine");
  save.className = "save";
  $("overLoginBtn").hidden = Boolean(user);
  g.pendingScore = score;
  show("overScreen");
  $("hud").hidden = true;
  if (user && g.runId) {
    save.textContent = "Saving your score…";
    try {
      const r = await api.submit(g.runId, score);
      save.className = "save ok";
      save.textContent = r.rank ? `Saved! You're #${r.rank} on the leaderboard.` : "Saved!";
    } catch (e) {
      save.textContent = e.message;
    }
  } else if (!user) {
    save.textContent = "Log in to put this score on the leaderboard.";
  } else {
    save.textContent = "Couldn't reach the leaderboard. Check your connection.";
  }
}

// ------------------------------------------------------------------ leaderboard + accounts
let range = "all";
async function openBoard() {
  sfx.play("click");
  $("boardScreen").hidden = false;
  const list = $("boardList");
  list.replaceChildren(Object.assign(document.createElement("li"), { className: "empty", textContent: "Loading…" }));
  try {
    const { scores, me } = await api.top(range);
    list.replaceChildren(...(scores.length ? scores.map((s, i) => {
      const li = document.createElement("li");
      if (user && s.username === user.username) li.className = "mine";
      const r = Object.assign(document.createElement("span"), { className: "rank", textContent: `#${i + 1}` });
      const w = Object.assign(document.createElement("span"), { className: "who", textContent: s.username });
      const p = Object.assign(document.createElement("span"), { className: "pts", textContent: Number(s.score).toLocaleString() });
      li.append(r, w, p);
      return li;
    }) : [Object.assign(document.createElement("li"), { className: "empty", textContent: "No scores yet. Be the first!" })]));
    $("boardMe").textContent = me ? `Your best: ${me.best.toLocaleString()} · rank #${me.rank}` : user ? "Play a game to get on the board." : "Log in to see your rank.";
  } catch (e) {
    list.replaceChildren(Object.assign(document.createElement("li"), { className: "empty", textContent: e.message }));
  }
}

let mode = "login";
function setAuthMode(m) {
  mode = m;
  $("authTitle").textContent = m === "login" ? "Log in" : "Create account";
  $("authSubmit").textContent = m === "login" ? "Log in" : "Create account";
  $("authSwitch").textContent = m === "login" ? "New here? Create an account" : "Have an account? Log in";
  $("authPass").autocomplete = m === "login" ? "current-password" : "new-password";
  $("authError").textContent = "";
}
function openAuth(m = "login") {
  sfx.play("click");
  setAuthMode(m);
  $("authScreen").hidden = false;
  setTimeout(() => $("authName").focus(), 50);
}
function renderAccount() {
  $("accountBtn").textContent = user ? `👤 ${user.username} · Log out` : "Log in / Sign up";
}

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("authName").value.trim();
  const pass = $("authPass").value;
  $("authSubmit").disabled = true;
  $("authError").textContent = "";
  try {
    user = mode === "login" ? await api.login(name, pass) : await api.register(name, pass);
    $("authScreen").hidden = true;
    $("authPass").value = "";
    renderAccount();
    hud.toast(`Hi ${user.username}!`, 1200);
    // a score from the game just played can still be saved
    if (game?.over && game.pendingScore !== undefined && game.runId) {
      $("overLoginBtn").hidden = true;
      const save = $("saveLine");
      save.textContent = "Saving your score…";
      try {
        const r = await api.submit(game.runId, game.pendingScore);
        save.className = "save ok";
        save.textContent = r.rank ? `Saved! You're #${r.rank} on the leaderboard.` : "Saved!";
      } catch (err) {
        save.textContent = err.message;
      }
    }
  } catch (err) {
    $("authError").textContent = err.message;
  } finally {
    $("authSubmit").disabled = false;
  }
});
$("authSwitch").onclick = () => setAuthMode(mode === "login" ? "register" : "login");
$("authClose").onclick = () => ($("authScreen").hidden = true);
$("accountBtn").onclick = () => {
  if (user) {
    api.logout();
    user = null;
    renderAccount();
    hud.toast("Logged out", 1000);
  } else openAuth();
};
$("overLoginBtn").onclick = () => openAuth();
$("boardBtn").onclick = openBoard;
$("overBoardBtn").onclick = openBoard;
$("boardClose").onclick = () => ($("boardScreen").hidden = true);
document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b));
  range = b.dataset.range;
  openBoard();
}));
$("playBtn").onclick = play;
$("againBtn").onclick = play;
$("menuBtn").onclick = () => { stopGame(); menu(); };
$("pauseBtn").onclick = () => setPaused(true);
$("resumeBtn").onclick = () => setPaused(false);
$("quitBtn").onclick = () => { stopGame(); menu(); };
document.addEventListener("visibilitychange", () => document.hidden && setPaused(true));
window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" || e.code === "KeyP") setPaused(!(game && game.paused));
  if ((e.code === "Enter" || e.code === "Space") && !$("startScreen").hidden && $("authScreen").hidden && $("boardScreen").hidden) play();
});

// ------------------------------------------------------------------ menu + theme
function applyTheme() {
  const c = CFG.colors || {};
  document.documentElement.style.setProperty("--accent", /^#[0-9a-f]{6}$/i.test(c.accent || "") ? c.accent : "#7ad7ff");
  document.title = CFG.title;
  $("title").textContent = CFG.title;
  $("kicker").textContent = CFG.kicker || "";
  $("tagline").textContent = CFG.tagline || "";
  $("desc").textContent = CFG.description || "";
  $("hint").textContent = CFG.controls || "";
  $("previewNote").hidden = !PREVIEW;
}

function menu() {
  $("hud").hidden = true;
  show("startScreen");
  // a slow, idle 3D scene behind the menu
  loadEngine(CFG.engine).then((engine) => {
    if (game || !engine.idle) return;
    const stage = $("stage");
    stage.replaceChildren();
    const g = { input: makeInput(), paused: false, over: true, raf: 0, idle: true };
    game = g;
    let last = performance.now();
    const frame = (t) => {
      if (game !== g) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      g.tick?.(dt);
      g.raf = requestAnimationFrame(frame);
    };
    try {
      g.instance = engine.idle({ root: stage, cfg: CFG, loop: (fn) => (g.tick = fn) });
      g.raf = requestAnimationFrame(frame);
    } catch { /* no WebGL: the menu still works */ }
  });
}
// the idle scene is replaced as soon as a real game starts
const realPlay = play;

async function boot() {
  if (!CFG) return; // preview waits for its config
  applyTheme();
  user = await api.me();
  renderAccount();
  if (game) stopGame();
  menu();
  if (params.has("autoplay")) realPlay();
}

// Preview inside the builder: the parent sends the settings.
window.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "p2g:config" && d.config) {
    const restart = Boolean(game && !game.idle && !game.over && d.keepPlaying);
    CFG = d.config;
    if (restart) return applyTheme();
    stopGame();
    boot();
  }
  if (d.type === "p2g:play") realPlay();
});
if (PREVIEW && window.parent !== window) window.parent.postMessage({ type: "p2g:ready" }, "*");
boot();
