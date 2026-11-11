// 3D shooter: tap the invaders before they reach you.
import { THREE, makeStage, setWorld, mat, glow, particles, shaker, level, rand, pick, clamp, idleScene, color } from "./common.js";

export default function shooter(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const lv = level(cfg);
  const s = makeStage(ctx.root, { fov: 62, far: 300 });
  setWorld(s.scene, cfg, { fogNear: 40, fogFar: 120 });
  if (cfg.world !== "space") {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300, 30, 30), mat(c.ground || "#1b1e26", { flatShading: true }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -6;
    s.scene.add(ground);
  }
  s.camera.position.set(0, 0, 6);
  const fx = particles(s.scene);
  const shake = shaker(s.camera);
  const ray = new THREE.Raycaster();
  const enemies = [];
  const shapes = [() => new THREE.OctahedronGeometry(0.9), () => new THREE.IcosahedronGeometry(0.85), () => new THREE.TorusKnotGeometry(0.5, 0.18, 48, 8), () => new THREE.DodecahedronGeometry(0.85)];
  const cross = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 24), new THREE.MeshBasicMaterial({ color: color(c.accent || "#7affc4"), depthTest: false, transparent: true }));
  cross.renderOrder = 10;
  s.scene.add(cross);
  const aim = new THREE.Vector2(0, 0);
  let score = 0, lives = cfg.lives || 3, time = 0, next = 1, combo = 0, comboT = 0, kills = 0;

  const spawn = () => {
    const bonus = Math.random() < 0.08;
    const m = new THREE.Mesh(bonus ? new THREE.SphereGeometry(0.6, 16, 12) : pick(shapes)(), bonus ? glow(c.collect || "#ffd34d", 1) : glow(c.obstacle || pick(["#ff4d6d", "#9b5cff", "#3dd6ff"]), 0.45));
    m.position.set(rand(-7, 7), rand(-3.2, 3.8), -65);
    m.userData = { v: rand(10, 16) * lv + time * 0.12, wob: rand(0, 6), bonus, hp: !bonus && kills > 25 && Math.random() < 0.25 ? 2 : 1 };
    if (m.userData.hp === 2) m.scale.setScalar(1.4);
    s.scene.add(m);
    enemies.push(m);
  };

  const laser = (to) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.6, -0.8, 4), to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color(c.accent || "#7affc4") }));
    s.scene.add(line);
    setTimeout(() => { s.scene.remove(line); geo.dispose(); }, 70);
  };
  const fire = (v) => {
    sfx.play("shoot");
    ray.setFromCamera(v, s.camera);
    const hit = ray.intersectObjects(enemies, false)[0];
    if (!hit) { combo = 0; laser(ray.ray.at(60, new THREE.Vector3())); return; }
    const m = hit.object;
    laser(hit.point);
    m.userData.hp--;
    if (m.userData.hp > 0) { fx.burst(hit.point, c.accent, 6, 3); m.scale.multiplyScalar(0.85); return; }
    combo++;
    comboT = 1.2;
    kills++;
    const pts = m.userData.bonus ? 50 : 10 * Math.min(combo, 8);
    score += pts;
    sfx.play(m.userData.bonus ? "win" : "coin");
    fx.burst(m.position, m.userData.bonus ? c.collect || "#ffd34d" : c.obstacle || "#ff4d6d", 18, 6);
    if (combo > 2 && combo % 3 === 0) hud.toast(`Combo ×${combo}`, 700);
    s.scene.remove(m);
    enemies.splice(enemies.indexOf(m), 1);
    hud.set({ score, extra: String(kills) });
  };
  input.on("tap", (p) => { aim.set(p.x, p.y); fire(aim); });
  input.on("hover", (p) => aim.set(p.x, p.y));
  input.on("drag", (dx, dy, p) => aim.set(p.x, p.y));
  input.on("action", () => fire(aim));

  hud.set({ score: 0, lives, extra: "0", extraLabel: "Hits" });
  ctx.loop((dt) => {
    time += dt;
    const kx = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
    const ky = (input.held("up") ? 1 : 0) - (input.held("down") ? 1 : 0);
    if (kx || ky) aim.set(clamp(aim.x + kx * dt * 1.4, -1, 1), clamp(aim.y + ky * dt * 1.4, -1, 1));
    ray.setFromCamera(aim, s.camera);
    cross.position.copy(ray.ray.at(5, new THREE.Vector3()));
    cross.lookAt(s.camera.position);
    comboT -= dt;
    if (comboT <= 0) combo = 0;
    next -= dt;
    if (next <= 0) { spawn(); next = Math.max(0.35, 1.4 - time * 0.012) / lv; }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const m = enemies[i];
      const u = m.userData;
      m.position.z += u.v * dt;
      m.position.x += Math.sin(time * 2 + u.wob) * dt * 1.2;
      m.rotation.x += dt * 1.5;
      m.rotation.y += dt;
      if (m.position.z > 4) {
        s.scene.remove(m);
        enemies.splice(i, 1);
        if (u.bonus) continue;
        lives--;
        combo = 0;
        sfx.play("hit");
        shake.kick(0.4);
        hud.set({ lives });
        if (lives <= 0) {
          ctx.done(score);
          ctx.loop((d) => { fx.update(d); s.render(); });
          return;
        }
      }
    }
    fx.update(dt);
    shake.apply(dt, new THREE.Vector3(0, 0, 6));
    s.camera.lookAt(0, 0, -20);
    s.render();
  });
  return { destroy: s.dispose };
}
shooter.idle = (ctx) => idleScene(ctx, { floating: true });
