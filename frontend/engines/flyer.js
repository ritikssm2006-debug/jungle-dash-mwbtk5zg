// 3D flyer: steer a ship or plane through rings, dodge rocks.
import { THREE, makeStage, setWorld, mat, glow, playerMesh, particles, shaker, level, rand, clamp, lerp, idleScene, color } from "./common.js";

export default function flyer(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const s = makeStage(ctx.root, { fov: 64, far: 300 });
  setWorld(s.scene, cfg, { fogNear: 40, fogFar: 150 });
  if (cfg.world !== "space") {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 40, 40), mat(c.ground || "#20304a", { flatShading: true }));
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.08) * 2 + Math.cos(pos.getY(i) * 0.06) * 2 + rand(-0.6, 0.6));
    ground.geometry.computeVertexNormals();
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -9;
    s.scene.add(ground);
    ground.userData.scroll = true;
  }
  const ship = playerMesh(cfg.player === "plane" ? "plane" : "ship", c.player, c.accent);
  s.scene.add(ship);
  const trail = new THREE.PointLight(color(c.accent), 3, 6);
  trail.position.set(0, 0, 1.2);
  ship.add(trail);
  const fx = particles(s.scene);
  const shake = shaker(s.camera);
  const things = [];
  const ringMat = glow(c.collect || c.accent, 0.8);
  const rockMat = mat(c.obstacle || "#8a6a55", { flatShading: true, roughness: 0.9 });
  const lv = level(cfg);
  let px = 0, py = 0, tx = 0, ty = 0, speed = 24 * lv, time = 0, dist = 0, lives = cfg.lives || 3, hurt = 0, rings = 0, streak = 0, next = 30;
  const BX = 6, BY = 3.6;

  input.on("drag", (dx, dy) => {
    tx = clamp(tx + dx * 0.03, -BX, BX);
    ty = clamp(ty - dy * 0.03, -BY, BY);
  });

  const spawn = () => {
    const z = -160;
    if (Math.random() < 0.55) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 10, 32), ringMat);
      r.position.set(rand(-BX + 1, BX - 1), rand(-BY + 0.8, BY - 0.8), z);
      r.userData = { type: "ring" };
      s.scene.add(r);
      things.push(r);
    }
    const n = 1 + Math.floor(Math.random() * (1 + lv * 1.5));
    for (let i = 0; i < n; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.8, 1.6), 0), rockMat);
      rock.position.set(rand(-BX, BX), rand(-BY, BY), z - rand(0, 20));
      rock.userData = { type: "rock", spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), 0), r: rock.geometry.parameters.radius };
      s.scene.add(rock);
      things.push(rock);
    }
  };

  hud.set({ score: 0, lives, extra: "0", extraLabel: cfg.collectName || "Rings" });
  ctx.loop((dt) => {
    time += dt;
    speed = Math.min(24 * lv * 2, 24 * lv + time * 0.4 * lv);
    const kx = (input.held("left") ? -1 : 0) + (input.held("right") ? 1 : 0);
    const ky = (input.held("up") ? 1 : 0) + (input.held("down") ? -1 : 0);
    tx = clamp(tx + kx * dt * 9, -BX, BX);
    ty = clamp(ty + ky * dt * 7, -BY, BY);
    px = lerp(px, tx, Math.min(1, dt * 6));
    py = lerp(py, ty, Math.min(1, dt * 6));
    ship.position.set(px, py, 0);
    ship.rotation.z = (px - tx) * 0.35;
    ship.rotation.x = (ty - py) * 0.25;
    ship.visible = hurt > 0 ? Math.floor(hurt * 12) % 2 === 0 : true;
    hurt = Math.max(0, hurt - dt);

    const move = speed * dt;
    dist += move;
    s.scene.children.forEach((o) => {
      if (o.userData.scroll) { o.position.z += move; if (o.position.z > 60) o.position.z -= 120; }
      if (o.userData.spin === true) o.rotation.z += dt * 0.02;
    });
    next -= move;
    if (next <= 0) { spawn(); next = Math.max(12, 26 - time * 0.15); }

    for (let i = things.length - 1; i >= 0; i--) {
      const m = things[i];
      const u = m.userData;
      m.position.z += move;
      if (u.type === "rock") { m.rotation.x += u.spin.x * dt; m.rotation.y += u.spin.y * dt; }
      if (u.type === "ring") m.rotation.z += dt;
      if (Math.abs(m.position.z) < 0.9 && !u.done) {
        const d = Math.hypot(m.position.x - px, m.position.y - py);
        if (u.type === "ring" && d < 1.4) {
          u.done = true;
          rings++;
          streak++;
          sfx.play("coin");
          fx.burst(m.position, c.collect || c.accent, 16, 5);
          m.scale.setScalar(1.4);
          if (streak > 0 && streak % 5 === 0) hud.toast(`${streak} in a row! +${streak * 10}`);
        } else if (u.type === "ring") {
          u.done = true;
          streak = 0;
        } else if (u.type === "rock" && d < u.r * 0.85 + 0.45 && hurt === 0) {
          lives--;
          hurt = 1.6;
          streak = 0;
          sfx.play("hit");
          shake.kick(0.6);
          fx.burst(ship.position, c.obstacle || "#ff8a4a", 22, 6);
          hud.set({ lives });
          if (lives <= 0) {
            ship.visible = false;
            ctx.done(dist / 3 + rings * 50);
            ctx.loop((d2) => { fx.update(d2); s.render(); });
            return;
          }
        }
      }
      if (m.position.z > 10) { s.scene.remove(m); things.splice(i, 1); }
    }
    fx.update(dt);
    hud.set({ score: dist / 3 + rings * 50, extra: String(rings) });
    shake.apply(dt, new THREE.Vector3(px * 0.6, py * 0.6 + 1.6, 7.5));
    s.camera.lookAt(px * 0.8, py * 0.8, -12);
    s.render();
  });
  return { destroy: s.dispose };
}
flyer.idle = (ctx) => idleScene(ctx, { shape: ctx.cfg.player === "plane" ? "plane" : "ship" });
