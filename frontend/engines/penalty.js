// 3D penalty shootout: tap where to shoot, beat the keeper. Three misses and it's over.
import { THREE, makeStage, mat, glow, particles, shaker, level, rand, clamp, lerp, idleScene, color } from "./common.js";

export default function penalty(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const lv = level(cfg);
  const s = makeStage(ctx.root, { fov: 50 });
  s.scene.background = color(c.sky, "#07101c");
  s.scene.fog = new THREE.Fog(color(c.fog || c.sky, "#07101c"), 30, 90);
  s.scene.add(new THREE.HemisphereLight(0xffffff, 0x223322, 1.1));
  for (const x of [-14, 14]) {
    const flood = new THREE.SpotLight(0xffffff, 300, 80, 0.6, 0.5);
    flood.position.set(x, 18, 4);
    flood.target.position.set(0, 0, -12);
    s.scene.add(flood, flood.target);
  }
  // pitch with mowing stripes
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 256;
  const g2 = cv.getContext("2d");
  for (let i = 0; i < 8; i++) { g2.fillStyle = i % 2 ? color(c.ground, "#2f8a3e").getStyle() : color(c.ground, "#2f8a3e").offsetHSL(0, 0, 0.04).getStyle(); g2.fillRect(0, i * 32, 64, 32); }
  const grass = new THREE.CanvasTexture(cv);
  grass.colorSpace = THREE.SRGBColorSpace;
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
  grass.repeat.set(4, 2);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(80, 70), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.9 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.z = -10;
  s.scene.add(pitch);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const box = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.12), lineMat);
  box.rotation.x = -Math.PI / 2;
  box.position.set(0, 0.01, -6);
  s.scene.add(box);

  // goal
  const GW = 7.3, GH = 2.44, GZ = -16;
  const post = mat("#f4f6fa", { roughness: 0.3 });
  const goal = new THREE.Group();
  for (const x of [-GW / 2, GW / 2]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GH, 10), post);
    p.position.set(x, GH / 2, 0);
    goal.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, GW, 10), post);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = GH;
  goal.add(bar);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(GW, GH, 18, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 }));
  net.position.set(0, GH / 2, -1.2);
  goal.add(net);
  goal.position.z = GZ;
  s.scene.add(goal);

  // keeper
  const keeper = new THREE.Group();
  const kBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.35), mat(c.obstacle || "#ffcf3d"));
  kBody.position.y = 1.05;
  const kHead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), mat("#e8c39e"));
  kHead.position.y = 1.95;
  const arms = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.22, 0.25), mat(c.obstacle || "#ffcf3d"));
  arms.position.y = 1.6;
  const gloves = [-1.1, 1.1].map((x) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), glow(c.accent || "#7affc4", 0.4)); m.position.set(x, 1.6, 0); return m; });
  keeper.add(kBody, kHead, arms, ...gloves);
  keeper.position.set(0, 0, GZ + 0.4);
  s.scene.add(keeper);

  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), mat(c.player || "#ffffff", { flatShading: true, roughness: 0.4 }));
  s.scene.add(ball);
  const aim = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 24), new THREE.MeshBasicMaterial({ color: color(c.accent || "#7affc4"), transparent: true, opacity: 0.85 }));
  aim.position.set(0, 1.2, GZ + 0.05);
  s.scene.add(aim);

  const fx = particles(s.scene);
  const shake = shaker(s.camera);
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -GZ);
  let shot = null, keeperTarget = 0, keeperDive = 0, misses = 0, goals = 0, streak = 0, score = 0, shots = 0, wait = 0, t = 0;
  const maxMiss = cfg.lives || 3;
  const reset = () => {
    ball.position.set(0, 0.22, 0);
    ball.rotation.set(0, 0, 0);
    shot = null;
    keeper.position.x = 0;
    keeper.rotation.z = 0;
    keeperDive = 0;
  };
  reset();

  const shoot = (target) => {
    if (shot || wait > 0) return;
    target.x = clamp(target.x, -GW / 2 - 0.6, GW / 2 + 0.6);
    target.y = clamp(target.y, 0.2, GH + 0.6);
    shots++;
    sfx.play("shoot");
    shot = { from: ball.position.clone(), to: new THREE.Vector3(target.x, target.y, GZ), t: 0, dur: 0.62 / Math.sqrt(lv), curve: rand(-0.6, 0.6) };
    // the keeper guesses: better guesses on harder settings and longer games
    const skill = clamp(0.35 + lv * 0.18 + shots * 0.012, 0.3, 0.85);
    keeperTarget = Math.random() < skill ? clamp(target.x + rand(-0.6, 0.6), -GW / 2, GW / 2) : rand(-GW / 2, GW / 2);
    keeperDive = target.y > 1.5 ? 1 : 0.5;
  };
  const toGoal = (p) => {
    ray.setFromCamera(new THREE.Vector2(p.x, p.y), s.camera);
    const v = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, v) ? v : null;
  };
  input.on("tap", (p) => { const v = toGoal(p); if (v) shoot(v); });
  input.on("hover", (p) => { const v = toGoal(p); if (v && !shot) aim.position.set(clamp(v.x, -GW / 2, GW / 2), clamp(v.y, 0.2, GH), GZ + 0.05); });
  input.on("action", () => shoot(aim.position.clone()));

  hud.set({ score: 0, lives: maxMiss, extra: "0", extraLabel: "Goals" });
  const result = (goal) => {
    wait = 1.3;
    if (goal) {
      goals++;
      streak++;
      score += 100 + (streak - 1) * 25;
      sfx.play("win");
      hud.toast(streak > 1 ? `GOAL! ×${streak}` : "GOAL!", 1000);
      fx.burst(ball.position, c.accent || "#7affc4", 30, 7);
      shake.kick(0.2);
    } else {
      misses++;
      streak = 0;
      sfx.play("wrong");
      hud.toast(Math.abs(ball.position.x) > GW / 2 || ball.position.y > GH ? "Missed!" : "Saved!", 1000);
      hud.set({ lives: maxMiss - misses });
    }
    hud.set({ score, extra: String(goals) });
    if (misses >= maxMiss) ctx.done(score, { delay: 1200 });
  };

  ctx.loop((dt) => {
    t += dt;
    const kx = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
    const ky = (input.held("up") ? 1 : 0) - (input.held("down") ? 1 : 0);
    if ((kx || ky) && !shot) aim.position.set(clamp(aim.position.x + kx * dt * 5, -GW / 2, GW / 2), clamp(aim.position.y + ky * dt * 3, 0.2, GH), GZ + 0.05);
    aim.rotation.z += dt;
    if (shot) {
      shot.t += dt / shot.dur;
      const k = Math.min(1, shot.t);
      ball.position.lerpVectors(shot.from, shot.to, k);
      ball.position.x += Math.sin(k * Math.PI) * shot.curve;
      ball.position.y += Math.sin(k * Math.PI) * 0.6;
      ball.rotation.x -= dt * 20;
      // keeper dives
      keeper.position.x = lerp(keeper.position.x, keeperTarget, Math.min(1, dt * 7 * lv));
      keeper.rotation.z = -Math.sign(keeperTarget) * Math.min(1.1, Math.abs(keeper.position.x) * 0.5) * keeperDive;
      if (k >= 1 && !shot.done) {
        shot.done = true;
        const inGoal = Math.abs(shot.to.x) < GW / 2 - 0.1 && shot.to.y < GH - 0.05;
        const reach = 1.3 + (keeperDive > 0.5 ? 0.3 : 0);
        const saved = Math.abs(shot.to.x - keeper.position.x) < reach && shot.to.y < 2.6;
        result(inGoal && !saved);
      }
    } else {
      keeper.position.x = Math.sin(t * 1.6) * 0.8;
    }
    if (wait > 0) { wait -= dt; if (wait <= 0 && misses < maxMiss) reset(); }
    fx.update(dt);
    shake.apply(dt, new THREE.Vector3(0, 2.2, 5.5));
    s.camera.lookAt(0, 1.1, GZ);
    s.render();
  });
  return { destroy: s.dispose };
}
penalty.idle = (ctx) => idleScene(ctx, { shape: "ball" });
