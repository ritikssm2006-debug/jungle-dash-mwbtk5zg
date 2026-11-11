// 3D stack: tap to drop the sliding block. Only the overlap stays.
import { THREE, makeStage, mat, particles, level, rand, idleScene, color } from "./common.js";

export default function stack(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const s = makeStage(ctx.root, { fov: 45 });
  s.scene.background = color(c.sky, "#0b0b10");
  s.scene.add(new THREE.HemisphereLight(0xffffff, color(c.ground, "#222"), 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 5);
  s.scene.add(sun);
  const fx = particles(s.scene);

  const H = 0.6;
  const base = color(c.player, "#7ad7ff");
  const tint = (i) => base.clone().offsetHSL((i * 0.025) % 1, 0, Math.sin(i * 0.3) * 0.06);
  const blocks = [];
  const falling = [];
  const add = (w, d, x, z, y, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mat(tint(i), { roughness: 0.35, metalness: 0.15 }));
    m.position.set(x, y, z);
    m.userData = { w, d };
    s.scene.add(m);
    return m;
  };
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 3), mat(c.ground || "#2a2d36"));
  pedestal.position.y = -3 - H / 2;
  s.scene.add(pedestal);
  blocks.push(add(3, 3, 0, 0, 0, 0));

  const lv = level(cfg);
  let moving = null, axis = "x", dir = 1, t = 0, score = 0, perfect = 0, camY = 4, over = false;
  const speed = () => (2.6 + Math.min(score, 40) * 0.06) * lv;

  const next = () => {
    const top = blocks[blocks.length - 1];
    axis = axis === "x" ? "z" : "x";
    const i = blocks.length;
    moving = add(top.userData.w, top.userData.d, top.position.x, top.position.z, top.position.y + H, i);
    moving.position[axis] = -5;
    dir = 1;
  };
  next();

  const drop = () => {
    if (over || !moving) return;
    const top = blocks[blocks.length - 1];
    const size = axis === "x" ? "w" : "d";
    const delta = moving.position[axis] - top.position[axis];
    const len = top.userData[size];
    let overlap = len - Math.abs(delta);
    if (overlap <= 0) {
      // missed: the block falls
      falling.push({ m: moving, v: 0, r: rand(-2, 2) });
      moving = null;
      over = true;
      sfx.play("hit");
      ctx.done(score, { delay: 1200 });
      return;
    }
    if (Math.abs(delta) < 0.12) {
      // perfect: snap into place
      moving.position[axis] = top.position[axis];
      overlap = len;
      perfect++;
      sfx.play("right");
      fx.burst(moving.position, c.accent, 14, 3);
      if (perfect >= 2) hud.toast(`Perfect ×${perfect}`, 700);
    } else {
      perfect = 0;
      sfx.play("click");
      // cut off the overhang and let it fall
      const cutLen = len - overlap;
      const w = axis === "x" ? cutLen : moving.userData.w;
      const d = axis === "z" ? cutLen : moving.userData.d;
      const piece = add(w, d, moving.position.x, moving.position.z, moving.position.y, blocks.length);
      // the overhang sits between the old top's edge and the moving block's edge
      piece.position[axis] = top.position[axis] + delta / 2 + Math.sign(delta) * (len / 2);
      falling.push({ m: piece, v: 0, r: rand(-2, 2) });
      // keep the overlap
      moving.position[axis] = top.position[axis] + delta / 2;
      moving.userData[size] = overlap;
      moving.geometry.dispose();
      moving.geometry = new THREE.BoxGeometry(moving.userData.w, H, moving.userData.d);
    }
    blocks.push(moving);
    score++;
    hud.set({ score });
    next();
  };
  input.on("tap", drop);
  input.on("action", drop);

  hud.set({ score: 0, extra: null });
  ctx.loop((dt) => {
    t += dt;
    if (moving) {
      moving.position[axis] += dir * speed() * dt;
      if (moving.position[axis] > 5) dir = -1;
      if (moving.position[axis] < -5) dir = 1;
    }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.v += 18 * dt;
      f.m.position.y -= f.v * dt;
      f.m.rotation.x += f.r * dt;
      if (f.m.position.y < camY - 30) { s.scene.remove(f.m); falling.splice(i, 1); }
    }
    const topY = blocks[blocks.length - 1].position.y;
    camY += (topY + 4.5 - camY) * Math.min(1, dt * 3);
    const a = 0.785 + Math.sin(t * 0.2) * 0.08;
    s.camera.position.set(Math.cos(a) * 10, camY + 4, Math.sin(a) * 10);
    s.camera.lookAt(0, camY - 2.5, 0);
    fx.update(dt);
    s.render();
  });
  return { destroy: s.dispose };
}
stack.idle = (ctx) => idleScene(ctx, { floating: true });
