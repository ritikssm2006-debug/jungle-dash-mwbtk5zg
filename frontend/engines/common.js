// Shared 3D helpers for the game engines: renderer, worlds, meshes, effects.
import * as THREE from "../lib/three.module.min.js";

export { THREE };

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const color = (c, fallback = "#ffffff") => (c && c.isColor ? c.clone() : new THREE.Color(/^#[0-9a-f]{6}$/i.test(c || "") ? c : fallback));

/** A renderer that fills `root` and keeps its size in step with it. */
export function makeStage(root, { fov = 60, near = 0.1, far = 400 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  const resize = () => {
    const w = root.clientWidth || window.innerWidth;
    const h = root.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    // keep the action in view on tall phone screens
    camera.fov = w / h < 0.8 ? fov + 14 : fov;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  const dispose = () => {
    ro.disconnect();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
  return { renderer, scene, camera, render: () => renderer.render(scene, camera), dispose };
}

/** Sky colour, fog and soft lights for a world. */
export function setWorld(scene, cfg, { fogNear = 30, fogFar = 140 } = {}) {
  const c = cfg.colors;
  const sky = color(c.sky, "#0b1020");
  scene.background = sky;
  scene.fog = new THREE.Fog(color(c.fog || c.sky, "#0b1020"), fogNear, fogFar);
  const hemi = new THREE.HemisphereLight(0xffffff, color(c.ground, "#222222"), 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(6, 14, 8);
  scene.add(sun);
  if (cfg.world === "space" || cfg.world === "night") scene.add(starField(cfg.world === "space" ? 900 : 400));
  return { hemi, sun };
}

export function starField(count = 600, radius = 180) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(radius * rand(0.6, 1));
    p.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true, fog: false }));
  stars.userData.spin = true;
  return stars;
}

export const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: color(c), roughness: 0.55, metalness: 0.1, ...extra });
export const glow = (c, intensity = 0.6) => new THREE.MeshStandardMaterial({ color: color(c), emissive: color(c), emissiveIntensity: intensity, roughness: 0.3 });

/** The player's look: box, ball, car, ship, runner (a little character) or plane. */
export function playerMesh(shape, c, accent) {
  const g = new THREE.Group();
  const body = mat(c, { metalness: 0.3, roughness: 0.35 });
  const trim = glow(accent || "#ffffff", 0.5);
  if (shape === "ball") {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 20), body));
  } else if (shape === "car") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 2), body);
    base.position.y = 0.35;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.38, 1), mat("#111318", { metalness: 0.6, roughness: 0.2 }));
    cab.position.set(0, 0.72, 0.1);
    g.add(base, cab);
    for (const [x, z] of [[-0.55, 0.65], [0.55, 0.65], [-0.55, -0.65], [0.55, -0.65]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 14), mat("#0b0b0d"));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.22, z);
      g.add(w);
    }
    const lights = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.05), trim);
    lights.position.set(0, 0.42, 1.01);
    g.add(lights);
  } else if (shape === "ship" || shape === "plane") {
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.8, 10), body);
    hull.rotation.x = -Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(shape === "plane" ? 2.6 : 1.9, 0.08, 0.6), body);
    wing.position.z = 0.25;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.45), body);
    fin.position.set(0, 0.25, 0.6);
    const engine = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), trim);
    engine.position.z = 0.9;
    g.add(hull, wing, fin, engine);
  } else if (shape === "runner") {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 6, 12), body);
    torso.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), mat("#f1d3b5"));
    head.position.y = 1.62;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 8, 20), trim);
    band.position.y = 1.7;
    band.rotation.x = Math.PI / 2;
    const legs = [-0.15, 0.15].map((x) => {
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), mat("#1c1e25"));
      l.position.set(x, 0.38, 0);
      g.add(l);
      return l;
    });
    g.userData.legs = legs;
    g.add(torso, head, band);
  } else {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), body));
  }
  return g;
}

/** A spinning collectible (coin, gem, star...). */
export function collectibleMesh(kind, c) {
  let geo;
  if (kind === "gem") geo = new THREE.OctahedronGeometry(0.38);
  else if (kind === "star") geo = new THREE.IcosahedronGeometry(0.36);
  else if (kind === "orb") geo = new THREE.SphereGeometry(0.32, 16, 12);
  else {
    geo = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 22);
    geo.rotateX(Math.PI / 2);
  }
  return new THREE.Mesh(geo, glow(c, 0.55));
}

/** Scenery on both sides of a track, recycled as the world moves. */
export function scenery(world, c) {
  const g = new THREE.Group();
  const tone = color(c.scenery || c.obstacle || "#444a58");
  const make = () => {
    if (world === "city" || world === "night") {
      const h = rand(4, 16);
      const m = new THREE.Mesh(new THREE.BoxGeometry(rand(2, 4), h, rand(2, 4)), mat(tone.clone().offsetHSL(0, 0, rand(-0.1, 0.1))));
      m.position.y = h / 2;
      if (world === "night") {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, h * 0.7), glow(c.accent || "#ffd27a", 0.9));
        win.position.set(0, 0, 1.6);
        m.add(win);
      }
      return m;
    }
    if (world === "forest" || world === "jungle") {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6), mat("#5b3a22"));
      trunk.position.y = 0.7;
      const s = rand(1.4, 2.6);
      const top = new THREE.Mesh(new THREE.ConeGeometry(s * 0.6, s * 1.6, 7), mat(tone.clone().offsetHSL(rand(-0.03, 0.03), 0, rand(-0.08, 0.06))));
      top.position.y = 1.4 + s * 0.7;
      t.add(trunk, top);
      return t;
    }
    if (world === "desert") {
      const t = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.6, 4, 8), mat("#4f7a3b"));
      body.position.y = 1;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.6, 4, 8), mat("#4f7a3b"));
      arm.position.set(0.4, 1.3, 0);
      arm.rotation.z = -0.6;
      t.add(body, arm);
      if (Math.random() < 0.5) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.6, 1.4)), mat(tone));
        rock.position.set(rand(-1, 1), 0.3, rand(-1, 1));
        t.add(rock);
      }
      return t;
    }
    if (world === "snow") {
      const t = new THREE.Group();
      const s = rand(1.2, 2.2);
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(s * (0.75 - i * 0.18), s * 0.9, 7), mat(i === 2 ? "#f4f7fb" : "#2f5d4a"));
        cone.position.y = 0.6 + i * s * 0.45;
        t.add(cone);
      }
      return t;
    }
    if (world === "candy") {
      const t = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), mat("#f6f1ea"));
      stick.position.y = 1.1;
      const top = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 10, 20), glow(pick([c.accent || "#ff7ab6", c.player || "#7ad7ff", "#ffd36b"]), 0.35));
      top.position.y = 2.4;
      t.add(stick, top);
      return t;
    }
    if (world === "ocean") {
      const t = new THREE.Mesh(new THREE.ConeGeometry(rand(0.8, 1.8), rand(1, 3), 5), mat(tone));
      t.position.y = 0.2;
      return t;
    }
    // space: floating crystals
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.6, 1.6)), mat(tone, { metalness: 0.6, roughness: 0.2 }));
    m.position.y = rand(1, 6);
    m.userData.spin = rand(-1, 1);
    return m;
  };
  return { group: g, make };
}

/** Small bursts of particles for hits and pickups. */
export function particles(scene) {
  const list = [];
  const geo = new THREE.TetrahedronGeometry(0.12);
  return {
    burst(pos, c, n = 14, speed = 5) {
      const m = glow(c, 0.9);
      for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(geo, m);
        p.position.copy(pos);
        p.userData.v = new THREE.Vector3(rand(-1, 1), rand(0.2, 1.4), rand(-1, 1)).multiplyScalar(speed);
        p.userData.life = rand(0.4, 0.8);
        scene.add(p);
        list.push(p);
      }
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.userData.life -= dt;
        p.userData.v.y -= 12 * dt;
        p.position.addScaledVector(p.userData.v, dt);
        p.rotation.x += dt * 8;
        p.scale.setScalar(Math.max(0.01, p.userData.life * 1.6));
        if (p.userData.life <= 0) {
          scene.remove(p);
          list.splice(i, 1);
        }
      }
    },
  };
}

/** Camera shake, eased back to rest. */
export function shaker(camera) {
  let amount = 0;
  const base = new THREE.Vector3();
  return {
    kick(a = 0.4) { amount = Math.max(amount, a); },
    apply(dt, rest) {
      base.copy(rest);
      if (amount > 0.001) {
        camera.position.set(base.x + rand(-amount, amount), base.y + rand(-amount, amount), base.z);
        amount *= Math.pow(0.02, dt);
      } else camera.position.copy(base);
    },
  };
}

/** A striped canvas texture for roads and tracks. */
export function stripeTexture(base, line, { lanes = 3, dashes = true } = {}) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = line;
  for (let i = 1; i < lanes; i++) {
    const px = (256 / lanes) * i - 3;
    if (dashes) for (let y = 0; y < 256; y += 64) x.fillRect(px, y, 6, 36);
    else x.fillRect(px, 0, 6, 256);
  }
  x.fillRect(0, 0, 8, 256);
  x.fillRect(248, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Difficulty as a number: easy 0.8, normal 1, hard 1.3. */
export const level = (cfg) => ({ easy: 0.8, normal: 1, hard: 1.3 }[cfg.difficulty] || 1) * (cfg.speed || 1);

/** The slow 3D scene behind the menu: the world, its scenery and the player turning. */
export function idleScene(ctx, { shape = "box", floating = false } = {}) {
  const { cfg } = ctx;
  const s = makeStage(ctx.root, { fov: 55 });
  setWorld(s.scene, cfg, { fogNear: 12, fogFar: 70 });
  const c = cfg.colors;
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), mat(c.ground || "#1a1c22"));
  ground.rotation.x = -Math.PI / 2;
  if (!floating && cfg.world !== "space") s.scene.add(ground);
  const sc = scenery(cfg.world, c);
  for (let i = 0; i < 26; i++) {
    const m = sc.make();
    const a = (i / 26) * Math.PI * 2;
    const r = rand(9, 22);
    m.position.x = Math.cos(a) * r;
    m.position.z = Math.sin(a) * r;
    sc.group.add(m);
  }
  s.scene.add(sc.group);
  const hero = floating ? new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), mat(c.player, { metalness: 0.5, roughness: 0.2, flatShading: true })) : playerMesh(shape, c.player, c.accent);
  hero.position.y = floating ? 2.2 : 0;
  hero.scale.setScalar(floating ? 1 : 1.6);
  s.scene.add(hero);
  const orbs = [];
  for (let i = 0; i < 8; i++) {
    const o = collectibleMesh(cfg.collectible || "coin", c.collect || c.accent);
    o.userData.a = (i / 8) * Math.PI * 2;
    s.scene.add(o);
    orbs.push(o);
  }
  let t = 0;
  ctx.loop((dt) => {
    t += dt;
    sc.group.rotation.y += dt * 0.05;
    hero.rotation.y += dt * 0.5;
    if (floating) hero.rotation.x += dt * 0.3;
    orbs.forEach((o, i) => {
      const a = o.userData.a + t * 0.4;
      o.position.set(Math.cos(a) * 3.6, 1.6 + Math.sin(t * 2 + i) * 0.4, Math.sin(a) * 3.6);
      o.rotation.y += dt * 2;
    });
    s.camera.position.set(Math.sin(t * 0.1) * 9, 4.5, Math.cos(t * 0.1) * 9);
    s.camera.lookAt(0, 1.4, 0);
    s.render();
  });
  return { destroy: s.dispose };
}

/** Floating 3D shapes behind the quiz and memory games. */
export function backdrop(ctx) {
  const { cfg } = ctx;
  const c = cfg.colors;
  const s = makeStage(ctx.root, { fov: 55 });
  s.scene.background = color(c.sky, "#07070a");
  s.scene.fog = new THREE.Fog(color(c.fog || c.sky, "#07070a"), 10, 40);
  s.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(5, 8, 6);
  s.scene.add(sun);
  if (cfg.world === "space" || cfg.world === "night") s.scene.add(starField(500, 60));
  const shapes = [];
  const geos = [new THREE.IcosahedronGeometry(1, 0), new THREE.OctahedronGeometry(1), new THREE.TorusGeometry(0.8, 0.28, 12, 28), new THREE.DodecahedronGeometry(1)];
  const tones = [c.accent, c.player, c.collect, c.obstacle].filter(Boolean);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(pick(geos), mat(pick(tones.length ? tones : ["#ffffff"]), { metalness: 0.5, roughness: 0.25, flatShading: true }));
    m.position.set(rand(-14, 14), rand(-8, 8), rand(-22, -4));
    m.scale.setScalar(rand(0.5, 1.6));
    m.userData = { r: new THREE.Vector3(rand(-0.6, 0.6), rand(-0.6, 0.6), 0), f: rand(0.3, 0.8), p: rand(0, 6) };
    s.scene.add(m);
    shapes.push(m);
  }
  s.camera.position.set(0, 0, 8);
  let t = 0;
  let pulse = 0;
  return {
    stage: s,
    pulse(v = 1) { pulse = v; },
    update(dt) {
      t += dt;
      pulse = Math.max(0, pulse - dt * 2);
      shapes.forEach((m) => {
        m.rotation.x += m.userData.r.x * dt * (1 + pulse * 6);
        m.rotation.y += m.userData.r.y * dt * (1 + pulse * 6);
        m.position.y += Math.sin(t * m.userData.f + m.userData.p) * dt * 0.3;
      });
      s.camera.position.x = Math.sin(t * 0.1) * 1.5;
      s.camera.lookAt(0, 0, -10);
      s.render();
    },
    dispose: s.dispose,
  };
}
