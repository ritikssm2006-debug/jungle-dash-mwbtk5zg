// 3D helix: turn the tower so the bouncing ball drops through the gaps.
import { THREE, makeStage, mat, glow, particles, shaker, level, rand, idleScene, color } from "./common.js";

const SEG = 12;
const STEP = (Math.PI * 2) / SEG;
const GAP_Y = 3;

export default function helix(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const lv = level(cfg);
  const s = makeStage(ctx.root, { fov: 55 });
  s.scene.background = color(c.sky, "#0b0b10");
  s.scene.fog = new THREE.Fog(color(c.fog || c.sky, "#0b0b10"), 10, 34);
  s.scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(4, 10, 8);
  s.scene.add(sun);
  const fx = particles(s.scene);
  const shake = shaker(s.camera);

  const tower = new THREE.Group();
  s.scene.add(tower);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 400, 24), mat(c.scenery || "#e8e8ee", { roughness: 0.4 }));
  pole.position.y = -190;
  tower.add(pole);

  const safeMat = mat(c.ground || "#3d7bff", { roughness: 0.35, metalness: 0.1 });
  const dangerMat = glow(c.obstacle || "#ff3b5c", 0.5);
  const platforms = [];
  let made = 0;
  const makePlatform = () => {
    const i = made++;
    const g = new THREE.Group();
    g.position.y = -i * GAP_Y;
    const kinds = new Array(SEG).fill("safe");
    if (i > 0) {
      const gapAt = Math.floor(Math.random() * SEG);
      const gapLen = Math.random() < 0.5 ? 2 : 3;
      for (let k = 0; k < gapLen; k++) kinds[(gapAt + k) % SEG] = "gap";
      const dangers = i < 3 ? 0 : Math.min(4, Math.floor(rand(0, 1.5 + lv * 1.2 + i * 0.04)));
      for (let k = 0; k < dangers; k++) {
        const at = Math.floor(Math.random() * SEG);
        if (kinds[at] === "safe" && at !== 0) kinds[at] = "danger";
      }
    } else kinds[3] = kinds[4] = "gap";
    kinds.forEach((k, j) => {
      if (k === "gap") return;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.4, 5, 1, false, j * STEP + 0.01, STEP - 0.02), k === "danger" ? dangerMat : safeMat);
      g.add(m);
    });
    g.userData = { kinds, i, passed: false };
    tower.add(g);
    platforms.push(g);
  };
  for (let i = 0; i < 14; i++) makePlatform();

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), mat(c.player || "#ffd34d", { roughness: 0.25, metalness: 0.2 }));
  const BZ = 1.8;
  ball.position.set(0, 2, BZ);
  s.scene.add(ball);
  let vy = 0, combo = 0, score = 0, lives = cfg.lives || 3, rot = 0, spin = 0, over = false, camY = 4, passed = 0;

  input.on("drag", (dx) => (rot += dx * 0.011));
  hud.set({ score: 0, lives, extra: null });

  const segmentUnderBall = () => {
    let a = -tower.rotation.y; // ball sits at angle 0 (towards the camera)
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.floor(a / STEP);
  };

  ctx.loop((dt) => {
    spin += ((input.held("left") ? 1 : 0) - (input.held("right") ? 1 : 0)) * dt * 3.4;
    tower.rotation.y = rot + spin;
    if (!over) {
      vy -= 24 * dt;
      const prev = ball.position.y;
      ball.position.y += vy * dt;
      // the ball's bottom crossed a floor's top surface this frame
      const next = platforms.find((p) => !p.userData.passed && prev - 0.34 >= p.position.y + 0.2 - 0.001 && ball.position.y - 0.34 < p.position.y + 0.2);
      if (next && vy < 0) {
        const kind = next.userData.kinds[segmentUnderBall()];
        if (kind === "gap" || combo >= 3) {
          // fall through (a fast fall smashes even solid floors)
          next.userData.passed = true;
          combo++;
          passed++;
          score += 10 * combo;
          sfx.play(combo >= 3 ? "win" : "coin");
          fx.burst(new THREE.Vector3(0, next.position.y, BZ), combo >= 3 ? c.accent : c.ground || "#3d7bff", combo >= 3 ? 26 : 10, 5);
          next.children.forEach((m) => (m.userData.fall = rand(2, 5)));
          if (combo === 3) hud.toast("Smash!", 700);
          hud.set({ score });
          if (passed % 25 === 0) hud.toast(`Level ${passed / 25 + 1}`, 900);
        } else if (kind === "danger") {
          lives--;
          sfx.play("hit");
          shake.kick(0.35);
          fx.burst(ball.position, c.obstacle || "#ff3b5c", 18, 5);
          hud.set({ lives });
          ball.position.y = next.position.y + 0.54;
          vy = 8;
          combo = 0;
          if (lives <= 0) {
            over = true;
            ball.visible = false;
            ctx.done(score);
          }
        } else {
          ball.position.y = next.position.y + 0.54;
          vy = 8;
          combo = 0;
          sfx.play("jump");
          ball.scale.set(1.25, 0.75, 1.25);
        }
      }
    }
    ball.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 10));
    // broken floors fly away; keep building downwards
    platforms.forEach((p) => p.children.forEach((m) => {
      if (m.userData.fall) { m.position.y -= m.userData.fall * dt * 3; m.position.x += m.userData.fall * dt; m.material.transparent = true; }
    }));
    while (platforms.length && platforms[0].position.y > ball.position.y + 12) tower.remove(platforms.shift());
    while (made * GAP_Y < -ball.position.y + 40) makePlatform();
    camY += (ball.position.y + 3.2 - camY) * Math.min(1, dt * 4);
    fx.update(dt);
    shake.apply(dt, new THREE.Vector3(0, camY + 2.6, 9));
    s.camera.lookAt(0, camY - 2.6, 0);
    s.render();
  });
  return { destroy: s.dispose };
}
helix.idle = (ctx) => idleScene(ctx, { floating: true });
