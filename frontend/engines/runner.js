// Endless 3D runner: three lanes, jump, slide, collect, don't crash.
import { THREE, makeStage, setWorld, mat, playerMesh, collectibleMesh, scenery, particles, shaker, stripeTexture, level, rand, pick, lerp, idleScene, color } from "./common.js";

const LANES = [-2.2, 0, 2.2];

export default function runner(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const s = makeStage(ctx.root, { fov: 62 });
  setWorld(s.scene, cfg, { fogNear: 25, fogFar: 95 });

  // track
  const tex = stripeTexture(color(c.ground, "#20232b").getStyle(), "rgba(255,255,255,0.35)");
  tex.repeat.set(1, 30);
  const track = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 240), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  track.rotation.x = -Math.PI / 2;
  track.position.z = -100;
  s.scene.add(track);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(200, 240), mat(color(c.ground, "#20232b").offsetHSL(0, -0.05, -0.06)));
  side.rotation.x = -Math.PI / 2;
  side.position.set(0, -0.02, -100);
  s.scene.add(side);

  const sc = scenery(cfg.world, c);
  s.scene.add(sc.group);
  for (let z = 6; z > -110; z -= 7) for (const x of [-7, 7]) {
    const m = sc.make();
    m.position.set(x + rand(-1.5, 1.5) + Math.sign(x) * rand(0, 6), m.position.y, z + rand(-2, 2));
    sc.group.add(m);
  }

  const player = playerMesh(cfg.player || "runner", c.player, c.accent);
  s.scene.add(player);
  const fx = particles(s.scene);
  const shake = shaker(s.camera);
  const rest = new THREE.Vector3(0, 3.7, 7.4);

  const things = []; // obstacles and pickups
  const obstacleMat = mat(c.obstacle || "#ff5d5d", { roughness: 0.4 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: color(c.obstacle || "#ff5d5d"), emissive: color(c.obstacle || "#ff5d5d"), emissiveIntensity: 0.35 });

  let lane = 1, x = 0, y = 0, vy = 0, slide = 0, lives = cfg.lives || 3, hurt = 0, coins = 0, dist = 0, time = 0, nextRow = 30;
  const lv = level(cfg);
  let speed = 16 * lv;

  const spawnRow = (z) => {
    const free = Math.floor(Math.random() * 3);
    const blocks = Math.random() < 0.35 + 0.15 * lv ? 2 : 1;
    const used = new Set([free]);
    for (let i = 0; i < blocks; i++) {
      let l;
      do l = Math.floor(Math.random() * 3); while (used.has(l));
      used.add(l);
      const kind = time < 8 ? pick(["block", "low"]) : pick(["block", "low", "bar", "low", "block"]);
      let m;
      if (kind === "block") m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 1.2), obstacleMat);
      else if (kind === "low") m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.62, 0.5), edgeMat);
      else {
        m = new THREE.Group();
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.4), edgeMat);
        bar.position.y = 1.55;
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.75, 0.12), obstacleMat);
        p1.position.set(-0.9, 0.87, 0);
        const p2 = p1.clone();
        p2.position.x = 0.9;
        m.add(bar, p1, p2);
      }
      if (m.geometry) m.position.y = m.geometry.parameters.height / 2;
      m.position.set(LANES[l], m.position.y, z);
      m.userData = { type: kind, lane: l };
      s.scene.add(m);
      things.push(m);
    }
    // a line of pickups in the free lane
    if (Math.random() < 0.8) for (let i = 0; i < 5; i++) {
      const p = collectibleMesh(cfg.collectible, c.collect || c.accent);
      p.position.set(LANES[free], 0.9, z - 2 - i * 2.2);
      p.userData = { type: "coin", lane: free };
      s.scene.add(p);
      things.push(p);
    }
  };

  const goLane = (d) => {
    const n = Math.max(0, Math.min(2, lane + d));
    if (n !== lane) { lane = n; sfx.play("click"); }
  };
  input.on("left", () => goLane(-1));
  input.on("right", () => goLane(1));
  input.on("jump", () => { if (y <= 0.001) { vy = 9.2; slide = 0; sfx.play("jump"); } });
  input.on("tap", () => { if (y <= 0.001) { vy = 9.2; sfx.play("jump"); } });
  input.on("down", () => { slide = 0.75; if (y > 0) vy = -14; });

  hud.set({ score: 0, lives, extra: "0", extraLabel: cfg.collectName || "Coins" });

  ctx.loop((dt) => {
    time += dt;
    speed = Math.min(16 * lv * 2.2, 16 * lv + time * 0.38 * lv);
    const move = speed * dt;
    dist += move;
    tex.offset.y += move / 8;
    // player
    x = lerp(x, LANES[lane], Math.min(1, dt * 14));
    vy -= 26 * dt;
    y = Math.max(0, y + vy * dt);
    if (y === 0) vy = 0;
    slide = Math.max(0, slide - dt);
    player.position.set(x, y, 0);
    player.scale.y = slide > 0 ? 0.5 : 1;
    player.rotation.z = (LANES[lane] - x) * 0.15;
    if (player.userData.legs) player.userData.legs.forEach((l, i) => (l.rotation.x = y > 0 ? 0.6 : Math.sin(time * 16 + i * Math.PI) * 0.8));
    player.visible = hurt > 0 ? Math.floor(hurt * 12) % 2 === 0 : true;
    hurt = Math.max(0, hurt - dt);

    // scenery recycles
    sc.group.children.forEach((m) => {
      m.position.z += move;
      if (m.position.z > 12) m.position.z -= 120;
      if (m.userData.spin) m.rotation.y += dt * m.userData.spin;
    });

    // spawning
    nextRow -= move;
    if (nextRow <= 0) {
      spawnRow(-90);
      nextRow = Math.max(11, 22 - time * 0.12) / Math.min(1.25, lv);
    }

    for (let i = things.length - 1; i >= 0; i--) {
      const m = things[i];
      m.position.z += move;
      const u = m.userData;
      if (u.type === "coin") m.rotation.y += dt * 4;
      const near = Math.abs(m.position.z) < (u.type === "coin" ? 0.9 : 0.75) && Math.abs(m.position.x - x) < 1;
      if (near && u.type === "coin") {
        coins++;
        sfx.play("coin");
        fx.burst(m.position, c.collect || c.accent, 6, 3);
        s.scene.remove(m);
        things.splice(i, 1);
        continue;
      }
      if (near && hurt === 0) {
        const clear = (u.type === "low" && y > 0.55) || (u.type === "bar" && slide > 0);
        if (!clear) {
          lives--;
          hurt = 1.6;
          sfx.play("hit");
          shake.kick(0.45);
          fx.burst(player.position.clone().setY(1), c.obstacle || "#ff5d5d", 18, 6);
          s.scene.remove(m);
          things.splice(i, 1);
          hud.set({ lives });
          if (lives <= 0) {
            player.visible = false;
            ctx.done(dist + coins * 10);
            ctx.loop((d) => { fx.update(d); s.render(); });
            return;
          }
          continue;
        }
      }
      if (m.position.z > 10) {
        s.scene.remove(m);
        things.splice(i, 1);
      }
    }
    fx.update(dt);
    if (Math.floor(time) !== Math.floor(time - dt) && Math.floor(time) % 20 === 0) hud.toast("Faster!", 800);
    hud.set({ score: dist + coins * 10, extra: String(coins) });
    shake.apply(dt, rest);
    s.camera.position.x += x * 0.35;
    s.camera.lookAt(x * 0.4, 1, -8);
    s.render();
  });

  return { destroy: s.dispose };
}
runner.idle = (ctx) => idleScene(ctx, { shape: ctx.cfg.player || "runner" });
