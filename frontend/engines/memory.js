// 3D card memory: flip two cards, find all the pairs.
import { backdrop, idleScene } from "./common.js";

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export default function memory(ctx) {
  const { cfg, hud, sfx } = ctx;
  const bg = backdrop(ctx);
  const layer = document.createElement("div");
  layer.className = "layer";
  document.body.appendChild(layer);
  const pairs = { easy: 6, normal: 8, hard: 10 }[cfg.difficulty] || 8;
  const items = shuffle((cfg.memory?.items || []).filter(Boolean)).slice(0, pairs);
  const deck = shuffle([...items, ...items]);
  const cols = deck.length <= 16 ? 4 : 5;
  const grid = document.createElement("div");
  grid.className = "mem-grid";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.width = `min(${cols * 112}px, 100%)`;
  layer.appendChild(grid);

  let open = [], found = 0, moves = 0, time = 0, score = 0, busy = false, done = false;
  const limit = cfg.timeLimit || 0;
  const cards = deck.map((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mem-card";
    const back = Object.assign(document.createElement("span"), { className: "face back" });
    const front = Object.assign(document.createElement("span"), { className: `face front${[...item].length > 3 ? " word" : ""}`, textContent: item });
    b.append(back, front);
    b.onclick = () => flip(b, item);
    grid.appendChild(b);
    return b;
  });

  const flip = (b, item) => {
    if (busy || done || b.classList.contains("open") || b.classList.contains("done")) return;
    sfx.play("click");
    b.classList.add("open");
    open.push({ b, item });
    if (open.length < 2) return;
    moves++;
    const [a, c] = open;
    if (a.item === c.item) {
      found++;
      score += 100 + Math.max(0, 30 - moves);
      sfx.play("right");
      bg.pulse(1);
      setTimeout(() => { a.b.classList.add("done"); c.b.classList.add("done"); }, 250);
      open = [];
      if (found === items.length) {
        done = true;
        const bonus = Math.max(0, Math.round((limit ? limit - time : 120 - time) * 5));
        score += bonus;
        hud.toast(`All pairs! +${bonus}`, 1400);
        ctx.done(score, { won: true, delay: 1500 });
      }
    } else {
      busy = true;
      setTimeout(() => { a.b.classList.remove("open"); c.b.classList.remove("open"); open = []; busy = false; }, 800);
    }
    hud.set({ score, extra: `${found}/${items.length}` });
  };

  hud.set({ score: 0, extra: `0/${items.length}`, extraLabel: "Pairs" });
  ctx.loop((dt) => {
    bg.update(dt);
    if (done) return;
    time += dt;
    if (limit && time >= limit) {
      done = true;
      hud.toast("Time's up!", 1000);
      cards.forEach((c) => c.classList.add("open"));
      ctx.done(score, { delay: 1400 });
    }
  });
  return { destroy() { layer.remove(); bg.dispose(); } };
}
memory.idle = (ctx) => idleScene(ctx, { floating: true });
