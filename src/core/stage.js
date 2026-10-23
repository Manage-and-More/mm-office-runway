// Renderer, camera, lights and ground. Shared by every module.
// The canvas is transparent: the sky behind it is CSS plus the illustrated layer from sky.js.
import * as THREE from "three";
import { CROWD_OUTER_RADIUS } from "../contracts/module.js";
import { createSky } from "./sky.js";

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

  // Navigation: orbit around the garden (drag, ← →, buttons) and zoom (wheel, pinch, buttons).
  // Targets are eased every frame, and the gentle pointer sway stays on top.
  const nav = { azimuth: 0, zoom: 1, targetAzimuth: 0, targetZoom: 1, follow: null };
  const ZOOM = { min: 0.24, max: 1.7 }; // 0.24 ≈ standing right in front of a Mii
  const clampZoom = (z) => Math.min(ZOOM.max, Math.max(ZOOM.min, z));
  const look = lookAt.clone(), lookGoal = lookAt.clone();
  const navigation = {
    rotate(step = Math.PI / 8) { nav.targetAzimuth += step; },
    zoom(factor) { nav.targetZoom = clampZoom(nav.targetZoom * factor); },
    /** Programmatic zoom level (1 = home). */
    zoomTo(level) { nav.targetZoom = clampZoom(level); },
    /** Follow a moving point: a function returning a Vector3 each frame (the face itself when atHead), or null for the garden. */
    focus(getPosition, { atHead = false, getHeading = null } = {}) { nav.follow = getPosition; nav.followAtHead = atHead; nav.followHeading = getHeading; },
    reset() { nav.targetAzimuth = Math.round(nav.targetAzimuth / (2 * Math.PI)) * 2 * Math.PI; nav.targetZoom = 1; nav.follow = null; nav.followHeading = null; },
  };
  const surface = renderer.domElement;
  let drag = null, pinch = null;
  surface.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    drag = { x: e.clientX, azimuth: nav.targetAzimuth, id: e.pointerId };
    try { surface.setPointerCapture(e.pointerId); } catch { /* synthetic events have no active pointer */ }
  });
  surface.addEventListener("pointermove", (e) => {
    if (drag && e.pointerId === drag.id) nav.targetAzimuth = drag.azimuth + (e.clientX - drag.x) / innerWidth * Math.PI * 1.2;
  });
  const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  surface.addEventListener("pointerup", endDrag);
  surface.addEventListener("pointercancel", endDrag);
  surface.addEventListener("wheel", (e) => { e.preventDefault(); navigation.zoom(Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  surface.addEventListener("touchstart", (e) => { if (e.touches.length === 2) pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), zoom: nav.targetZoom }; }, { passive: true });
  surface.addEventListener("touchmove", (e) => {
    if (!pinch || e.touches.length !== 2) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    nav.targetZoom = clampZoom(pinch.zoom * pinch.d / d);
  }, { passive: true });
  surface.addEventListener("touchend", () => { pinch = null; }, { passive: true });
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea, dialog")) return;
    if (e.key === "ArrowLeft") navigation.rotate(-Math.PI / 12);
    if (e.key === "ArrowRight") navigation.rotate(Math.PI / 12);
    if (e.key === "+" || e.key === "=") navigation.zoom(0.85);
    if (e.key === "-") navigation.zoom(1 / 0.85);
    if (e.key === "0") navigation.reset();
  });

  const goal = new THREE.Vector3();
  function updateCamera() {
    const ease = reducedMotion ? 1 : 0.08;
    nav.azimuth += (nav.targetAzimuth - nav.azimuth) * ease;
    nav.zoom += (nav.targetZoom - nav.zoom) * ease;
    // Where we look: the garden, or a followed Mii (head height) that may be walking.
    const followed = nav.follow?.();
    if (followed) lookGoal.set(followed.x, followed.y + (nav.followAtHead ? 0 : 0.9), followed.z); else lookGoal.copy(lookAt);
    if (followed && nav.followHeading) {
      // Stand in front of the face: Miis face +Z in their own frame, so the camera goes where they look.
      let heading = nav.followHeading();
      heading += Math.round((nav.targetAzimuth - heading) / (2 * Math.PI)) * 2 * Math.PI; // nearest turn, no spinning round
      nav.targetAzimuth = heading;
    }
    look.lerp(lookGoal, ease);
    // Closer in, the camera also comes down (zoom^1.4 on height) so a zoomed shot feels like standing in the park.
    const r = cameraHome.z * nav.zoom, y = look.y + (cameraHome.y - lookAt.y) * Math.pow(nav.zoom, 1.4);
    goal.set(look.x + Math.sin(nav.azimuth) * r + pointer.x * 1.5 * nav.zoom, y - pointer.y * nav.zoom, look.z + Math.cos(nav.azimuth) * r);
    camera.position.x += (goal.x - camera.position.x) * 0.06;
    camera.position.y += (goal.y - camera.position.y) * 0.06;
    camera.position.z += (goal.z - camera.position.z) * 0.06;
    camera.lookAt(look);
  }

  // Sun, moon, stars, clouds, lights and fog all follow stress (see sky.js).
  const skyLayer = createSky({
    scene, renderer, camera, sun, hemi: sky, reducedMotion,
    horizonPoint: new THREE.Vector3(0, 0, -ISLAND_RADIUS),
  });

  return { renderer, scene, camera, updateCamera, navigation, setStress: skyLayer.update, celebrate: skyLayer.celebrate };
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
