// 3D snake: eat, grow, don't bite yourself or the walls.
import { THREE, makeStage, setWorld, mat, glow, collectibleMesh, particles, shaker, level, idleScene, color } from "./common.js";

const N = 17;

export default function snake(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const lv = level(cfg);
  const s = makeStage(ctx.root, { fov: 48 });
  setWorld(s.scene, cfg, { fogNear: 30, fogFar: 80 });
  const fx = particles(s.scene);
  const shake = shaker(s.camera);
  const half = (N - 1) / 2;
  const board = new THREE.Mesh(new THREE.BoxGeometry(N + 0.6, 0.5, N + 0.6), mat(c.ground || "#1d2028"));
  board.position.y = -0.25;
  s.scene.add(board);
  const grid = new THREE.GridHelper(N, N, color(c.accent).getHex(), color(c.accent).getHex());
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  grid.position.y = 0.01;
  s.scene.add(grid);
  const wallMat = glow(c.obstacle || "#ff4d6d", 0.4);
  for (const [x, z, w, d] of [[0, -half - 0.8, N + 1.6, 0.4], [0, half + 0.8, N + 1.6, 0.4], [-half - 0.8, 0, 0.4, N + 1.6], [half + 0.8, 0, 0.4, N + 1.6]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.7, d), wallMat);
    wall.position.set(x, 0.1, z);
    s.scene.add(wall);
  }
  const headMat = mat(c.player || "#7affc4", { roughness: 0.3, metalness: 0.2 });
  const bodyMat = mat(color(c.player || "#7affc4").offsetHSL(0, -0.1, -0.12), { roughness: 0.35 });
  const cube = new THREE.BoxGeometry(0.86, 0.86, 0.86);
  let body, dir, nextDir, food, foodMesh, score = 0, lives = cfg.lives || 3, acc = 0, eaten = 0, dead = false;
  const parts = [];
  const toWorld = (p, m) => m.position.set(p.x - half, 0.43, p.z - half);
  const placeFood = () => {
    do food = { x: Math.floor(Math.random() * N), z: Math.floor(Math.random() * N), bonus: Math.random() < 0.12 };
    while (body.some((b) => b.x === food.x && b.z === food.z));
    if (foodMesh) s.scene.remove(foodMesh);
    foodMesh = collectibleMesh(food.bonus ? "star" : cfg.collectible || "orb", food.bonus ? "#ffd34d" : c.collect || c.accent);
    foodMesh.scale.setScalar(food.bonus ? 1.3 : 1);
    toWorld(food, foodMesh);
    s.scene.add(foodMesh);
  };
  const reset = () => {
    parts.forEach((m) => s.scene.remove(m));
    parts.length = 0;
    const m = Math.floor(N / 2);
    body = [{ x: m, z: m + 1 }, { x: m, z: m + 2 }, { x: m, z: m + 3 }];
    dir = { x: 0, z: -1 };
    nextDir = dir;
    dead = false;
    placeFood();
  };
  reset();
  const turn = (x, z) => { if (x !== -dir.x || z !== -dir.z) nextDir = { x, z }; };
  input.on("up", () => turn(0, -1));
  input.on("down", () => turn(0, 1));
  input.on("left", () => turn(-1, 0));
  input.on("right", () => turn(1, 0));

  hud.set({ score: 0, lives, extra: "3", extraLabel: "Length" });
  ctx.loop((dt) => {
    acc += dt;
    const stepTime = Math.max(0.065, (0.17 - eaten * 0.0025) / lv);
    while (!dead && acc >= stepTime) {
      acc -= stepTime;
      dir = nextDir;
      const head = { x: body[0].x + dir.x, z: body[0].z + dir.z };
      const crash = head.x < 0 || head.z < 0 || head.x >= N || head.z >= N || body.some((b, i) => i < body.length - 1 && b.x === head.x && b.z === head.z);
      if (crash) {
        dead = true;
        lives--;
        sfx.play("hit");
        shake.kick(0.4);
        parts.forEach((m) => fx.burst(m.position, c.player || "#7affc4", 2, 4));
        hud.set({ lives });
        if (lives <= 0) { ctx.done(score); break; }
        setTimeout(() => { reset(); hud.toast("Go!", 600); }, 900);
        break;
      }
      body.unshift(head);
      if (head.x === food.x && head.z === food.z) {
        eaten++;
        score += food.bonus ? 50 : 10;
        sfx.play(food.bonus ? "win" : "coin");
        fx.burst(foodMesh.position, food.bonus ? "#ffd34d" : c.collect || c.accent, 12, 4);
        if (food.bonus) for (let k = 0; k < 2; k++) body.push({ ...body[body.length - 1] });
        placeFood();
        hud.set({ score, extra: String(body.length) });
      } else body.pop();
    }
    // draw
    while (parts.length < body.length) { const m = new THREE.Mesh(cube, bodyMat); s.scene.add(m); parts.push(m); }
    while (parts.length > body.length) s.scene.remove(parts.pop());
    if (!dead) body.forEach((b, i) => {
      toWorld(b, parts[i]);
      parts[i].material = i === 0 ? headMat : bodyMat;
      parts[i].scale.setScalar(i === 0 ? 1 : 0.92 - Math.min(0.25, i * 0.006));
    });
    if (foodMesh) { foodMesh.rotation.y += dt * 3; foodMesh.position.y = 0.5 + Math.sin(performance.now() / 300) * 0.12; }
    fx.update(dt);
    shake.apply(dt, new THREE.Vector3(0, 17, 12.5));
    s.camera.lookAt(0, 0, 1);
    s.render();
  });
  return { destroy: s.dispose };
}
snake.idle = (ctx) => idleScene(ctx, { shape: "box" });
