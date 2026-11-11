// 3D traffic racer: steer through traffic, grab pickups, go faster and faster.
import { THREE, makeStage, setWorld, mat, playerMesh, collectibleMesh, scenery, particles, shaker, stripeTexture, level, rand, pick, clamp, lerp, idleScene, color } from "./common.js";

const LANES = [-3, -1, 1, 3];
const TRAFFIC = ["#e8e8ee", "#3d6fff", "#ffcf3d", "#2fbf71", "#9b5cff", "#ff8a3d", "#1b1d22"];

export default function racer(ctx) {
  const { cfg, hud, input, sfx } = ctx;
  const c = cfg.colors;
  const s = makeStage(ctx.root, { fov: 60 });
  setWorld(s.scene, cfg, { fogNear: 30, fogFar: 120 });

  const tex = stripeTexture("#25272d", "rgba(255,255,255,0.55)", { lanes: 4 });
  tex.repeat.set(1, 26);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 260), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
  road.rotation.x = -Math.PI / 2;
  road.position.z = -110;
  s.scene.add(road);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 260), mat(c.ground || "#2b2d33"));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.03, -110);
  s.scene.add(ground);
  // glowing road edges
  for (const x of [-4.4, 4.4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 260), new THREE.MeshStandardMaterial({ color: color(c.accent), emissive: color(c.accent), emissiveIntensity: 0.6 }));
    rail.position.set(x, 0.12, -110);
    s.scene.add(rail);
  }
  const sc = scenery(cfg.world, c);
  s.scene.add(sc.group);
  for (let z = 6; z > -120; z -= 6) for (const x of [-9, 9]) {
    const m = sc.make();
    m.position.set(x + Math.sign(x) * rand(0, 8), m.position.y, z + rand(-2, 2));
    sc.group.add(m);
  }

  const car = playerMesh("car", c.player, c.accent);
  s.scene.add(car);
  const fx = particles(s.scene);
  const shake = shaker(s.camera);
  const rest = new THREE.Vector3(0, 4.2, 8.2);
  const things = [];
  const lv = level(cfg);
  let x = 0, vx = 0, speed = 20 * lv, time = 0, dist = 0, lives = cfg.lives || 3, hurt = 0, coins = 0, nextCar = 20, nextCoin = 30;
  let steer = 0;
  let dragging = false;
  input.on("press", () => (dragging = true));
  input.on("release", () => (dragging = false));
  input.on("left", () => (vx -= 6));
  input.on("right", () => (vx += 6));

  const spawnCar = () => {
    const lane = Math.floor(Math.random() * 4);
    const m = playerMesh("car", pick(TRAFFIC), "#ff4b4b");
    m.rotation.y = lane < 2 ? Math.PI : 0; // oncoming traffic on the left
    m.position.set(LANES[lane], 0, -120);
    m.userData = { type: "car", v: lane < 2 ? -rand(8, 12) : rand(6, 10) };
    s.scene.add(m);
    things.push(m);
  };
  const spawnCoin = () => {
    const lane = Math.floor(Math.random() * 4);
    for (let i = 0; i < 4; i++) {
      const p = collectibleMesh(cfg.collectible, c.collect || c.accent);
      p.position.set(LANES[lane], 0.8, -120 - i * 3);
      p.userData = { type: "coin", v: 0 };
      s.scene.add(p);
      things.push(p);
    }
  };

  hud.set({ score: 0, lives, extra: "0 km/h", extraLabel: "Speed" });

  ctx.loop((dt) => {
    time += dt;
    speed = Math.min(20 * lv * 2.3, 20 * lv + time * 0.45 * lv);
    // steering: keys, or follow the finger / mouse while held
    const want = (input.held("left") ? -1 : 0) + (input.held("right") ? 1 : 0);
    if (dragging) steer = clamp(input.pointer.x * 1.6, -1, 1);
    else steer = lerp(steer, want, Math.min(1, dt * 8));
    vx = lerp(vx, steer * 9, Math.min(1, dt * 6));
    x = clamp(x + vx * dt, -3.6, 3.6);
    car.position.set(x, 0, 0);
    car.rotation.y = -vx * 0.04;
    car.rotation.z = vx * 0.012;
    car.visible = hurt > 0 ? Math.floor(hurt * 12) % 2 === 0 : true;
    hurt = Math.max(0, hurt - dt);

    const move = speed * dt;
    dist += move;
    tex.offset.y += move / 10;
    sc.group.children.forEach((m) => {
      m.position.z += move;
      if (m.position.z > 12) m.position.z -= 126;
      if (m.userData.spin) m.rotation.y += dt * m.userData.spin;
    });

    nextCar -= move;
    if (nextCar <= 0) { spawnCar(); nextCar = Math.max(9, 24 - time * 0.2) / Math.min(1.3, lv); }
    nextCoin -= move;
    if (nextCoin <= 0) { spawnCoin(); nextCoin = rand(40, 70); }

    for (let i = things.length - 1; i >= 0; i--) {
      const m = things[i];
      const u = m.userData;
      m.position.z += move - u.v * dt * (u.type === "car" ? 1 : 0);
      if (u.type === "coin") m.rotation.y += dt * 4;
      const hitZ = u.type === "car" ? 1.9 : 1;
      if (Math.abs(m.position.z) < hitZ && Math.abs(m.position.x - x) < (u.type === "car" ? 1.05 : 0.9)) {
        if (u.type === "coin") {
          coins++;
          sfx.play("coin");
          fx.burst(m.position, c.collect || c.accent, 6, 3);
          s.scene.remove(m);
          things.splice(i, 1);
          continue;
        }
        if (hurt === 0) {
          lives--;
          hurt = 1.6;
          sfx.play("hit");
          shake.kick(0.6);
          fx.burst(m.position.clone().setY(0.8), "#ffb04a", 22, 7);
          s.scene.remove(m);
          things.splice(i, 1);
          hud.set({ lives });
          if (lives <= 0) {
            ctx.done(dist / 2 + coins * 10);
            ctx.loop((d) => { fx.update(d); s.render(); });
            return;
          }
          continue;
        }
      }
      if (m.position.z > 12) { s.scene.remove(m); things.splice(i, 1); }
    }
    fx.update(dt);
    hud.set({ score: dist / 2 + coins * 10, extra: `${Math.round(speed * 4)} km/h` });
    shake.apply(dt, rest);
    s.camera.position.x += x * 0.45;
    s.camera.lookAt(x * 0.5, 0.6, -10);
    s.render();
  });
  return { destroy: s.dispose };
}
racer.idle = (ctx) => idleScene(ctx, { shape: "car" });
