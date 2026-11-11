// 3D maze: roll to the glowing exit before time runs out, grab gems on the way.
import { THREE, makeStage, setWorld, mat, glow, collectibleMesh, particles, level, clamp, idleScene, color } from "./common.js";

function carve(n) {
  const size = n * 2 + 1;
  const grid = Array.from({ length: size }, () => new Array(size).fill(1));
  const stack = [[1, 1]];
  grid[1][1] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const options = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => grid[y + dy]?.[x + dx] === 1 && x + dx > 0 && y + dy > 0 && x + dx < size - 1 && y + dy < size - 1);
    if (!options.length) { stack.pop(); continue; }
    const [dx, dy] = options[Math.floor(Math.random() * options.length)];
    grid[y + dy / 2][x + dx / 2] = 0;
    grid[y + dy][x + dx] = 0;
    stack.push([x + dx, y + dy]);
  }
  // a few loops so there's more than one way through
  for (let k = 0; k < n; k++) {
    const x = 1 + Math.floor(Math.random() * (size - 2));
    const y = 1 + Math.floor(Math.random() * (size - 2));
    if ((x + y) % 2 === 1) grid[y][x] = 0;
  }
  return grid;
}

export default function maze(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const lv = level(cfg);
  const s = makeStage(ctx.root, { fov: 50 });
  setWorld(s.scene, cfg, { fogNear: 18, fogFar: 46 });
  const fx = particles(s.scene);
  const world = new THREE.Group();
  s.scene.add(world);

  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 16), mat(c.player || "#ffd34d", { roughness: 0.25, metalness: 0.3 }));
  s.scene.add(ball);
  const lamp = new THREE.PointLight(color(c.player || "#ffd34d"), 6, 7);
  ball.add(lamp);

  let grid, size, gems = [], exit, stage = 0, score = 0, timeLeft = cfg.timeLimit || 60, px = 1, pz = 1, vx = 0, vz = 0, over = false;
  const build = () => {
    world.clear();
    gems = [];
    const n = Math.min(14, Math.round(5 + lv * 2 + stage));
    grid = carve(n);
    size = grid.length;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(c.ground || "#22252d"));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(size / 2 - 0.5, 0, size / 2 - 0.5);
    world.add(floor);
    const walls = [];
    grid.forEach((row, y) => row.forEach((v, x) => v && walls.push([x, y])));
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.2, 1), mat(c.scenery || c.obstacle || "#5a6070", { roughness: 0.5 }), walls.length);
    const m4 = new THREE.Matrix4();
    walls.forEach(([x, y], i) => inst.setMatrixAt(i, m4.makeTranslation(x, 0.6, y)));
    world.add(inst);
    const ex = size - 2;
    exit = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24), glow(c.accent || "#7affc4", 1));
    exit.position.set(ex, 0.05, ex);
    world.add(exit);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 3, 20, 1, true), new THREE.MeshBasicMaterial({ color: color(c.accent || "#7affc4"), transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.set(ex, 1.5, ex);
    world.add(beam);
    grid.forEach((row, y) => row.forEach((v, x) => {
      if (!v && (x + y) % 2 === 0 && Math.random() < 0.18 && !(x === 1 && y === 1) && !(x === ex && y === ex)) {
        const g = collectibleMesh(cfg.collectible || "gem", c.collect || c.accent);
        g.position.set(x, 0.5, y);
        world.add(g);
        gems.push(g);
      }
    }));
    px = 1; pz = 1; vx = 0; vz = 0;
  };
  build();

  const blocked = (x, z) => {
    const r = 0.3;
    for (let gy = Math.floor(z - r - 0.5) ; gy <= Math.ceil(z + r + 0.5); gy++)
      for (let gx = Math.floor(x - r - 0.5); gx <= Math.ceil(x + r + 0.5); gx++) {
        if (!grid[gy]?.[gx]) continue;
        const nx = clamp(x, gx - 0.5, gx + 0.5);
        const nz = clamp(z, gy - 0.5, gy + 0.5);
        if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return true;
      }
    return false;
  };

  // touch: drag from where you pressed, like a joystick
  let origin = null;
  input.on("press", (p) => (origin = { x: p.cx, y: p.cy }));
  input.on("release", () => (origin = null));
  hud.set({ score: 0, extra: `${Math.ceil(timeLeft)}s`, extraLabel: "Time" });

  ctx.loop((dt) => {
    if (!over) {
      timeLeft -= dt;
      let ax = (input.held("right") ? 1 : 0) - (input.held("left") ? 1 : 0);
      let az = (input.held("down") ? 1 : 0) - (input.held("up") ? 1 : 0);
      if (origin && input.pointer.down) {
        const dx = input.pointer.cx - origin.x;
        const dy = input.pointer.cy - origin.y;
        const d = Math.hypot(dx, dy);
        if (d > 8) { ax = dx / Math.max(d, 40); az = dy / Math.max(d, 40); }
      }
      const sp = 4.2;
      vx += (ax * sp - vx) * Math.min(1, dt * 10);
      vz += (az * sp - vz) * Math.min(1, dt * 10);
      if (!blocked(px + vx * dt, pz)) px += vx * dt; else vx = 0;
      if (!blocked(px, pz + vz * dt)) pz += vz * dt; else vz = 0;
      ball.position.set(px, 0.32, pz);
      ball.rotation.z -= vx * dt / 0.32;
      ball.rotation.x += vz * dt / 0.32;

      for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i];
        g.rotation.y += dt * 3;
        if (Math.hypot(g.position.x - px, g.position.z - pz) < 0.55) {
          score += 20;
          sfx.play("coin");
          fx.burst(g.position, c.collect || c.accent, 8, 3);
          world.remove(g);
          gems.splice(i, 1);
        }
      }
      if (Math.hypot(exit.position.x - px, exit.position.z - pz) < 0.5) {
        stage++;
        const bonus = 100 + Math.ceil(timeLeft) * 2;
        score += bonus;
        timeLeft += 25;
        sfx.play("win");
        hud.toast(`Level ${stage + 1}! +${bonus}`, 1200);
        build();
      }
      if (timeLeft <= 0) {
        over = true;
        timeLeft = 0;
        ctx.done(score);
      }
      hud.set({ score, extra: `${Math.ceil(timeLeft)}s` });
    }
    exit.rotation.y += dt;
    fx.update(dt);
    s.camera.position.set(px, 9.5, pz + 6.5);
    s.camera.lookAt(px, 0, pz + 0.4);
    s.render();
  });
  return { destroy: s.dispose };
}
maze.idle = (ctx) => idleScene(ctx, { shape: "ball" });
