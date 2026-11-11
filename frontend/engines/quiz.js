// Quiz over a 3D background: answer before the timer runs out.
import { backdrop, idleScene } from "./common.js";

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function mathQuestion(n, hard) {
  const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const ops = hard ? ["+", "−", "×", "÷"] : ["+", "−", "×"];
  const op = ops[r(0, ops.length - 1)];
  const big = 10 + n * (hard ? 4 : 2);
  let a = r(2, big), b = r(2, big), ans;
  if (op === "+") ans = a + b;
  if (op === "−") { if (b > a) [a, b] = [b, a]; ans = a - b; }
  if (op === "×") { a = r(2, 9 + n); b = r(2, 12); ans = a * b; }
  if (op === "÷") { b = r(2, 12); ans = r(2, 12); a = ans * b; }
  const wrong = new Set();
  while (wrong.size < 3) { const w = ans + r(-10, 10); if (w !== ans && w >= 0) wrong.add(w); }
  const options = shuffle([ans, ...wrong]);
  return { q: `${a} ${op} ${b} = ?`, options: options.map(String), answer: options.indexOf(ans) };
}

export default function quiz(ctx) {
  const { cfg, hud, sfx } = ctx;
  const bg = backdrop(ctx);
  const layer = document.createElement("div");
  layer.className = "layer";
  document.body.appendChild(layer);
  const q = cfg.quiz || {};
  const math = q.mode === "math";
  const seconds = q.seconds || 15;
  const pool = math ? [] : shuffle(q.questions || []).slice(0, q.perGame || 10);
  const total = math ? q.perGame || 15 : pool.length;
  let i = -1, score = 0, lives = cfg.lives || 3, timer = seconds, locked = false, streak = 0, current = null, finished = false;

  const card = document.createElement("div");
  card.className = "quiz-card";
  layer.appendChild(card);

  const show = () => {
    i++;
    if (i >= total) { finished = true; return ctx.done(score, { won: true, delay: 300 }); }
    const src = math ? mathQuestion(i, cfg.difficulty === "hard") : pool[i];
    // shuffle the options, keep track of the right one
    const order = shuffle(src.options.map((_, k) => k));
    current = { q: src.q, options: order.map((k) => src.options[k]), answer: order.indexOf(src.answer) };
    timer = seconds;
    locked = false;
    card.replaceChildren();
    const meta = document.createElement("div");
    meta.className = "quiz-meta";
    meta.append(Object.assign(document.createElement("span"), { textContent: `Question ${i + 1} / ${total}` }), Object.assign(document.createElement("span"), { textContent: streak > 1 ? `🔥 ${streak} in a row` : "" }));
    const bar = document.createElement("div");
    bar.className = "quiz-timer";
    const fill = document.createElement("i");
    bar.appendChild(fill);
    const h = Object.assign(document.createElement("p"), { className: "quiz-q", textContent: current.q });
    const opts = document.createElement("div");
    opts.className = "quiz-opts";
    current.options.forEach((o, k) => {
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: o });
      b.onclick = () => answer(k, opts);
      opts.appendChild(b);
    });
    card.append(meta, bar, h, opts);
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "";
    current.fill = fill;
    current.opts = opts;
  };

  const answer = (k, opts) => {
    if (locked || finished) return;
    locked = true;
    const buttons = [...opts.children];
    buttons[current.answer].classList.add("right");
    if (k === current.answer) {
      streak++;
      const pts = 100 + Math.ceil(timer) * 10 + (streak > 2 ? 50 : 0);
      score += pts;
      sfx.play("right");
      bg.pulse(1);
      hud.toast(`+${pts}`, 600);
    } else {
      streak = 0;
      lives--;
      if (k >= 0) buttons[k].classList.add("wrong");
      sfx.play("wrong");
      hud.set({ lives });
      if (k < 0) hud.toast("Time's up!", 700);
    }
    hud.set({ score, extra: `${Math.min(i + 1, total)}/${total}` });
    if (lives <= 0) { finished = true; return ctx.done(score, { delay: 1000 }); }
    setTimeout(() => !finished && show(), 1100);
  };

  // keys 1-4 answer too
  const onKey = (e) => { const n = Number(e.key); if (n >= 1 && n <= 4 && current?.opts) answer(n - 1, current.opts); };
  window.addEventListener("keydown", onKey);

  hud.set({ score: 0, lives, extra: `0/${total}`, extraLabel: "Question" });
  if (!total) { card.textContent = "This quiz has no questions yet."; } else show();
  ctx.loop((dt) => {
    bg.update(dt);
    if (!locked && current && !finished) {
      timer -= dt;
      current.fill.style.transform = `scaleX(${Math.max(0, timer / seconds)})`;
      if (timer <= 0) answer(-1, current.opts);
    }
  });
  return { destroy() { window.removeEventListener("keydown", onKey); layer.remove(); bg.dispose(); } };
}
quiz.idle = (ctx) => idleScene(ctx, { floating: true });
