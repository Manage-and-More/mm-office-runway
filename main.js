import * as THREE from "three";
import { config } from "./config.js";
import { loadNumber } from "./data.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Scene ----------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05070f, 0.035);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
camera.position.set(0, 0, 14);

scene.add(new THREE.AmbientLight(0x6070a0, 0.6));
const keyLight = new THREE.PointLight(0x00a2cc, 80, 50);
keyLight.position.set(5, 5, 8);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xff4fd8, 60, 50);
rimLight.position.set(-6, -4, 4);
scene.add(rimLight);

// Central crystal: solid core + wireframe shell.
const core = new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.2, 1),
  new THREE.MeshStandardMaterial({ color: 0x1b2a6b, metalness: 0.6, roughness: 0.25, flatShading: true }),
);
const shell = new THREE.Mesh(
  new THREE.IcosahedronGeometry(3.1, 1),
  new THREE.MeshBasicMaterial({ color: 0x00a2cc, wireframe: true, transparent: true, opacity: 0.35 }),
);
scene.add(core, shell);

// Torus rings.
const rings = [0xff4fd8, 0x00a2cc, 0x7cffcb].map((color, i) => {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4.5 + i * 0.9, 0.03, 8, 160),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  scene.add(ring);
  return ring;
});

// Orbiting cubes — their count follows the number (log scale, capped).
const orbiters = new THREE.Group();
scene.add(orbiters);
const cubeGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
function setOrbiters(value) {
  const count = Math.min(120, Math.max(6, Math.round(Math.log10(Math.abs(value) + 1) * 18)));
  while (orbiters.children.length > count) orbiters.remove(orbiters.children.at(-1));
  while (orbiters.children.length < count) {
    const cube = new THREE.Mesh(
      cubeGeo,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
        emissive: 0x111133,
        metalness: 0.3,
        roughness: 0.4,
      }),
    );
    cube.userData = {
      radius: 5 + Math.random() * 4,
      speed: 0.2 + Math.random() * 0.6,
      tilt: (Math.random() - 0.5) * 2,
      phase: Math.random() * Math.PI * 2,
    };
    orbiters.add(cube);
  }
}

// Starfield.
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(3000 * 3);
for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 120;
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaab4ff, size: 0.12 }));
scene.add(stars);

// ---------- Interaction ----------
const pointer = { x: 0, y: 0 };
addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = (e.clientY / innerHeight) * 2 - 1;
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.position.z = camera.aspect < 0.8 ? 20 : 14; // pull back on phones
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

// ---------- Animation loop ----------
let pulse = 0; // 1 → 0 after the number changes
const clock = new THREE.Clock();

function frame() {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  const speed = reduceMotion ? 0.15 : 1;

  core.rotation.x += dt * 0.3 * speed;
  core.rotation.y += dt * 0.45 * speed;
  shell.rotation.x -= dt * 0.15 * speed;
  shell.rotation.y -= dt * 0.2 * speed;
  rings.forEach((r, i) => { r.rotation.z += dt * (0.1 + i * 0.07) * speed; });

  for (const cube of orbiters.children) {
    const { radius, speed: s, tilt, phase } = cube.userData;
    const a = phase + t * s * speed;
    cube.position.set(Math.cos(a) * radius, Math.sin(a) * radius * tilt * 0.5, Math.sin(a) * radius);
    cube.rotation.x += dt * speed;
    cube.rotation.y += dt * speed;
  }

  stars.rotation.y += dt * 0.01 * speed;

  pulse = Math.max(0, pulse - dt * 0.8);
  const scale = 1 + pulse * 0.35;
  core.scale.setScalar(scale);
  shell.scale.setScalar(1 + pulse * 0.6);
  shell.material.opacity = 0.35 + pulse * 0.5;

  camera.position.x += (pointer.x * 2 - camera.position.x) * 0.03;
  camera.position.y += (-pointer.y * 2 - camera.position.y) * 0.03;
  camera.lookAt(0, 0, 0);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Data → UI ----------
const labelEl = document.getElementById("label");
const numberEl = document.getElementById("number");
const metaEl = document.getElementById("meta");
const fmt = new Intl.NumberFormat();
let shown = 0;
let current = null;

function countTo(target) {
  if (reduceMotion) { numberEl.textContent = fmt.format(target); shown = target; return; }
  const from = shown;
  const start = performance.now();
  const duration = 1500;
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    shown = Math.round(from + (target - from) * eased);
    numberEl.textContent = fmt.format(shown);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function refresh() {
  try {
    const { label, value, source } = await loadNumber(config);
    labelEl.textContent = label;
    if (value !== current) {
      current = value;
      pulse = 1;
      setOrbiters(value);
      countTo(value);
    }
    metaEl.textContent = `from ${source} · updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error(err);
    metaEl.textContent = "Couldn't load the number — retrying soon.";
  }
}

setOrbiters(0);
refresh();
setInterval(refresh, config.refreshSeconds * 1000);
