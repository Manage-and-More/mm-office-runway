// The sky over the office follows the money: a long runway is a sunny noon, a shrinking one
// sinks into golden hour, and an empty pot is night with a moon and stars. Clouds drift throughout.
//
// Two layers:
//   - an illustrated DOM layer behind the transparent canvas (sun, moon, stars, far clouds), so the
//     island hides the sun as it sets behind it;
//   - a few low-poly 3D clouds over the back of the island that cast moving shadows on the lobby.
// It also owns the scene lights and fog, which move with the same stress value.
import * as THREE from "three";

// Sky gradient + UI accent by stress: noon → afternoon → golden hour → dusk → night.
const SKY_STOPS = [
  { at: 0, top: "#8fe0ff", bottom: "#fff4d6", accent: "#2fd27a" },
  { at: 0.25, top: "#8fd3ff", bottom: "#fff1e0", accent: "#36c6f4" },
  { at: 0.5, top: "#ffc98a", bottom: "#ffeedd", accent: "#ffa62b" },
  { at: 0.7, top: "#b58ce0", bottom: "#ffb48a", accent: "#ff5a6e" },
  { at: 0.84, top: "#262d6e", bottom: "#6a55a8", accent: "#ff7a8a" },
  { at: 1, top: "#171b47", bottom: "#4a3d8a", accent: "#ff7a8a" },
];

const STAR_COUNT = 70;
const CLOUDS = [
  // width (px), top (% of the sky band), drift seconds, cover threshold (0 = always there)
  { w: 170, top: 0.18, dur: 140, t: 0 },
  { w: 120, top: 0.52, dur: 110, t: 0.08 },
  { w: 210, top: 0.34, dur: 170, t: 0.3 },
  { w: 100, top: 0.7, dur: 95, t: 0.45 },
  { w: 150, top: 0.1, dur: 125, t: 0.6 },
  { w: 190, top: 0.6, dur: 150, t: 0.72 },
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const deg = THREE.MathUtils.degToRad;

export function createSky({ scene, renderer, camera, sun, hemi, horizonPoint, reducedMotion }) {
  // ---- DOM layer ----
  const root = document.body; // inline on body, so it wins over the body[data-mood] fallbacks in style.css
  const layer = document.createElement("div");
  layer.className = "sky";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `
    <div class="stars"></div>
    <div class="sun"><div class="sun-rays"></div><div class="sun-core"></div></div>
    <div class="moon"><div class="moon-disc"><i></i><i></i><i></i></div></div>
    <div class="clouds"></div>`;
  document.body.prepend(layer);
  const sunEl = layer.querySelector(".sun");

  const stars = layer.querySelector(".stars");
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = document.createElement("span");
    s.className = i % 5 === 0 ? "star sparkle" : "star";
    s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;`
      + `--size:${(1 + Math.random() * 2.2).toFixed(1)}px;--delay:${(-Math.random() * 4).toFixed(2)}s;--dur:${(2 + Math.random() * 3).toFixed(2)}s`;
    stars.append(s);
  }
  const clouds = layer.querySelector(".clouds");
  for (const c of CLOUDS) {
    const el = document.createElement("span");
    el.className = "cloud";
    el.style.cssText = `--w:${c.w}px;--top:${c.top};--dur:${c.dur}s;--delay:${(-Math.random() * c.dur).toFixed(1)}s;--t:${c.t}`;
    clouds.append(el);
  }

  // Only touch the DOM when a value actually changes.
  const cache = new Map();
  function setVar(name, value) {
    if (cache.get(name) === value) return;
    cache.set(name, value);
    root.style.setProperty(name, value);
  }

  // ---- 3D clouds: puffs of one shared low-poly geometry, one draw call ----
  const PUFFS = [[0, 0, 0, 1.2], [1.1, -0.15, 0.2, 0.9], [-1.1, -0.2, -0.1, 0.85], [0.4, 0.45, -0.2, 0.8], [-0.5, 0.35, 0.3, 0.7]];
  const cloud3d = Array.from({ length: 5 }, (_, i) => ({
    angle: Math.PI + 0.45 + (i / 5) * (Math.PI - 0.9),
    radius: 11 + (i % 3) * 1.6,
    height: 5.6 + (i % 2) * 1.1,
    speed: 0.012 + (i % 3) * 0.004,
    size: 0.8 + (i % 2) * 0.35,
  }));
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const cloudMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cloudMat, cloud3d.length * PUFFS.length);
  cloudMesh.castShadow = true;
  cloudMesh.frustumCulled = false;
  cloudMesh.name = "sky:clouds";
  scene.add(cloudMesh);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const ARC_START = Math.PI + 0.3, ARC_END = 2 * Math.PI - 0.3;

  function placeClouds(dt) {
    let k = 0;
    for (const c of cloud3d) {
      if (!reducedMotion) {
        c.angle += c.speed * dt;
        if (c.angle > ARC_END) c.angle = ARC_START;
      }
      // Grow in at the start of the arc, shrink away at the end, so wrapping never pops.
      const fade = smooth(ARC_START, ARC_START + 0.35, c.angle) * (1 - smooth(ARC_END - 0.35, ARC_END, c.angle));
      const cx = Math.cos(c.angle) * c.radius, cz = Math.sin(c.angle) * c.radius;
      for (const [x, y, z, r] of PUFFS) {
        p.set(cx + x * c.size, c.height + y * c.size, cz + z * c.size);
        s.set(1, 0.72, 0.9).multiplyScalar(r * c.size * fade);
        cloudMesh.setMatrixAt(k++, m.compose(p, q, s));
      }
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- Lights, fog, colors ----
  const white = new THREE.Color(0xffffff), dusk = new THREE.Color(0xff9a5c), moonlight = new THREE.Color(0x9fb4ff);
  const skyDusk = new THREE.Color(0xffc3a0), skyNight = new THREE.Color(0x6b73c9);
  const groundDay = new THREE.Color(0xb5bcc7), groundNight = new THREE.Color(0x2a2d55);
  const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
  const colA = new THREE.Color(), colB = new THREE.Color(), fogColor = new THREE.Color();
  const horizon = new THREE.Vector3();

  function skyAt(stress) {
    let i = 0;
    while (i < SKY_STOPS.length - 2 && stress > SKY_STOPS[i + 1].at) i++;
    const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
    const t = clamp01((stress - a.at) / (b.at - a.at));
    return {
      top: `#${colA.set(a.top).lerp(colB.set(b.top), t).getHexString()}`,
      bottom: `#${colA.set(a.bottom).lerp(colB.set(b.bottom), t).getHexString()}`,
      accent: `#${colA.set(a.accent).lerp(colB.set(b.accent), t).getHexString()}`,
    };
  }

  let lastStress = -1, lastTime = performance.now();

  function update(stress) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    placeClouds(dt);

    // Where the island's far edge sits on screen: the sun sets behind it, the moon rises from it.
    horizon.copy(horizonPoint).project(camera);
    const h = innerHeight;
    const horizonY = Math.round((1 - (horizon.y + 1) / 2) * h);
    setVar("--horizon", `${horizonY}px`);

    if (Math.abs(stress - lastStress) < 0.001) return;
    lastStress = stress;

    const sunT = smooth(0, 0.74, stress); // 0 noon → 1 set
    const night = smooth(0.66, 0.86, stress);
    const moonT = smooth(0.64, 0.9, stress);

    const sky = skyAt(stress);
    setVar("--sky-top", sky.top);
    setVar("--sky-bottom", sky.bottom);
    setVar("--accent", sky.accent);
    setVar("--night", night.toFixed(3));
    setVar("--sun-t", sunT.toFixed(3));
    setVar("--moon-t", moonT.toFixed(3));
    setVar("--cover", (0.2 + stress * 0.75).toFixed(3));
    scene.fog?.color.copy(fogColor.set(sky.bottom));

    // Light comes from the side the sun is on (left), then from the moon (right) at night.
    const el = deg(8 + 57 * (1 - sunT)), az = deg(35);
    sunDir.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    moonDir.set(Math.sin(az) * Math.cos(deg(40)), Math.sin(deg(40)), Math.cos(az) * Math.cos(deg(40)));
    sun.position.copy(sunDir).lerp(moonDir, night).normalize().multiplyScalar(18);
    sun.color.copy(white).lerp(dusk, smooth(0.3, 1, sunT)).lerp(moonlight, night);
    sun.intensity = (2 - 0.7 * sunT) * (1 - night) + 1.3 * night;
    hemi.color.copy(white).lerp(skyDusk, sunT).lerp(skyNight, night);
    hemi.groundColor.copy(groundDay).lerp(groundNight, night);
    hemi.intensity = (2.2 - 0.6 * sunT) * (1 - night) + 1.6 * night;
    renderer.toneMappingExposure = 1.2 - 0.15 * night;
  }

  // Money came in: the sun does a happy spin, and a shooting star crosses the sky.
  function celebrate(strength = 1) {
    if (reducedMotion) return;
    sunEl.classList.remove("cheer");
    void sunEl.offsetWidth;
    sunEl.classList.add("cheer");
    const count = 1 + Math.round(clamp01(strength) * 2);
    for (let i = 0; i < count; i++) {
      const star = document.createElement("span");
      star.className = "shooting-star";
      star.style.cssText = `left:${25 + Math.random() * 60}%;top:${4 + Math.random() * 20}%;animation-delay:${i * 0.35}s`;
      layer.append(star);
      star.addEventListener("animationend", () => star.remove());
    }
  }

  return { update, celebrate };
}
