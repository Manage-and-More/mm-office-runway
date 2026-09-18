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

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xfff1e0, 30, 60);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const cameraHome = new THREE.Vector3(0, 7, 18);
  const lookAt = new THREE.Vector3(0, 1.8, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9b8f0, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
  scene.add(sun);

  scene.add(createIsland());

  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // Pull back on narrow screens so the whole crowd stays in view.
    cameraHome.z = camera.aspect < 0.8 ? 28 : 18;
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

  return { renderer, scene, camera, updateCamera };
}

// A floating pastel island: a darker rim underneath, a white plaza for the logo, confetti dots around the rim.
function createIsland() {
  const island = new THREE.Group();
  island.name = "island";

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_RADIUS, 64),
    new THREE.MeshStandardMaterial({ color: 0xd8cdfa, roughness: 0.95 }),
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
