// Renderer, camera, lights and ground. Shared by every module.
import * as THREE from "three";

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1026);
  scene.fog = new THREE.Fog(0x0b1026, 20, 45);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  const cameraHome = new THREE.Vector3(0, 7, 18);
  const lookAt = new THREE.Vector3(0, 1.8, 0);

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1a2e, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ color: 0x1c2446, roughness: 0.9 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

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
