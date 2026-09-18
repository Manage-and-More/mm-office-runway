// Renderer, camera, lights and ground. Shared by every module.
// The sky is CSS (style.css, tinted by mood); the canvas is transparent so it shows through.
import * as THREE from "three";
import { CROWD_OUTER_RADIUS } from "../contracts/module.js";

const ISLAND_RADIUS = 14;
const PALETTE = [0xff7eb6, 0xffd23f, 0x7ee0ff, 0xb28dff, 0xff9f5a, 0xffffff];

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xfff1e0, 30, 60);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const cameraHome = new THREE.Vector3(0, 10.6, 19);
  const lookAt = new THREE.Vector3(0, 0.9, 0);

  const sky = new THREE.HemisphereLight(0xffffff, 0xb5bcc7, 2.2);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0001;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
  scene.add(sun);

  // A nearly white ceramic surface: quiet grout lines and fine grain.
  // Generated once, no image download or repeating photo asset required.
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  let noise = 71;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
    const grain = ((noise >>> 24) / 255 - 0.5) * 4;
    const seam = x < 2 || y < 2;
    const bevel = x < 4 || y < 4 || x > size - 3 || y > size - 3;
    const value = Math.round((seam ? 220 : bevel ? 238 : 248) + grain);
    const offset = (y * size + x) * 4;
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }
  const floorTexture = new THREE.DataTexture(pixels, size, size);
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(ISLAND_RADIUS, ISLAND_RADIUS); // Two-world-unit tiles across the island.
  floorTexture.magFilter = THREE.LinearFilter;
  floorTexture.minFilter = THREE.LinearMipmapLinearFilter;
  floorTexture.generateMipmaps = true;
  floorTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  floorTexture.needsUpdate = true;

  scene.add(createIsland(floorTexture));

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => {
    if (reducedMotion) return;
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // Pull back on narrow screens so the whole crowd stays in view.
    // Fit the full 22-unit crowd width, including on narrow phone screens.
    cameraHome.z = Math.max(19, 11.2 / (Math.tan(THREE.MathUtils.degToRad(25)) * camera.aspect));
    cameraHome.y = cameraHome.z * 0.56;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();
  camera.position.copy(cameraHome);

  function updateCamera() {
    camera.position.x += (cameraHome.x + pointer.x * 1.5 - camera.position.x) * 0.03;
    camera.position.y += (cameraHome.y - pointer.y * 1 - camera.position.y) * 0.03;
    camera.position.z += (cameraHome.z - camera.position.z) * 0.05;
    camera.lookAt(lookAt);
  }

  // The sun sets on the office as money runs out: elevation 65° at stress 0 → 8° at stress 1,
  // warmer and dimmer light, and the CSS sky slides from day to dusk.
  const noon = new THREE.Color(0xffffff), dusk = new THREE.Color(0xff9a5c);
  const skyNoon = new THREE.Color(0xffffff), skyDusk = new THREE.Color(0xffc3a0);
  let lastStress = -1;
  function setStress(stress) {
    if (Math.abs(stress - lastStress) < 0.002) return;
    lastStress = stress;
    const elevation = THREE.MathUtils.degToRad(8 + 57 * (1 - stress));
    const azimuth = THREE.MathUtils.degToRad(35);
    sun.position.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)).multiplyScalar(18);
    sun.color.copy(noon).lerp(dusk, stress);
    sun.intensity = 2 - 0.7 * stress;
    sky.color.copy(skyNoon).lerp(skyDusk, stress);
    sky.intensity = 2.2 - 0.6 * stress;
    setSkyCss(stress);
  }

  return { renderer, scene, camera, updateCamera, setStress };
}

// CSS sky stops by stress: day → afternoon → golden hour → dusk.
const SKY_STOPS = [
  { at: 0, top: "#8fe0ff", bottom: "#fff4d6", accent: "#2fd27a" },
  { at: 0.25, top: "#8fd3ff", bottom: "#fff1e0", accent: "#36c6f4" },
  { at: 0.55, top: "#ffc98a", bottom: "#ffeedd", accent: "#ffa62b" },
  { at: 0.9, top: "#b58ce0", bottom: "#ffb48a", accent: "#ff5a6e" },
];
const cssA = new THREE.Color(), cssB = new THREE.Color();
function mix(a, b, t) {
  return `#${cssA.set(a).lerp(cssB.set(b), t).getHexString()}`;
}
function setSkyCss(stress) {
  let i = 0;
  while (i < SKY_STOPS.length - 2 && stress > SKY_STOPS[i + 1].at) i++;
  const a = SKY_STOPS[i], b = SKY_STOPS[i + 1];
  const t = Math.min(1, Math.max(0, (stress - a.at) / (b.at - a.at)));
  const style = document.body.style;
  style.setProperty("--sky-top", mix(a.top, b.top, t));
  style.setProperty("--sky-bottom", mix(a.bottom, b.bottom, t));
  style.setProperty("--accent", mix(a.accent, b.accent, t));
}

// A floating pastel island: a darker rim underneath, a white plaza for the logo, confetti dots around the rim.
function createIsland(floorTexture) {
  const island = new THREE.Group();
  island.name = "island";

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_RADIUS, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorTexture, bumpMap: floorTexture, bumpScale: 0.018, roughness: 0.93 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  island.add(ground);

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.8, 1.6, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xa98be0, roughness: 1, side: THREE.DoubleSide }),
  );
  rim.position.y = -0.8;
  island.add(rim);

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(3.1, 48),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  island.add(plaza);

  // Confetti dots between the crowd's outer edge and the rim, so they never sit under a Mii.
  const count = 90;
  const dots = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.14, 12),
    new THREE.MeshStandardMaterial({ roughness: 0.6 }),
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.05;
    const r = CROWD_OUTER_RADIUS + 0.6 + ((Math.sin(i * 78.233) + 1) / 2) * (ISLAND_RADIUS - CROWD_OUTER_RADIUS - 1);
    const s = 0.7 + ((Math.sin(i * 3.7) + 1) / 2) * 0.8;
    m.compose(new THREE.Vector3(Math.cos(a) * r, 0.015, Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
    dots.setMatrixAt(i, m);
    dots.setColorAt(i, c.setHex(PALETTE[i % PALETTE.length]));
  }
  island.add(dots);

  return island;
}
