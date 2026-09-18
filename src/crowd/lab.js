import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMii } from './mii.js';
import { MOTIONS, createPose, sampleMotion, blendPoses } from './motions.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#render-surface');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.autoClear = false;

function createView(element, hero = false) {
  const scene = new THREE.Scene();
  const mii = buildMii({ id: 'motion-lab' });
  // The public Mii is one unit tall. Enlarge only inside this inspection tool.
  mii.scale.multiplyScalar(2.7);
  const avatar = { root: mii, applyPose: mii.userData.applyPose };
  scene.add(avatar.root);
  scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x657885, 2.3));
  const key = new THREE.DirectionalLight(0xffeedc, 3.2);
  key.position.set(-3, 5, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x89e4d2, 1.5);
  rim.position.set(3, 3, -2); scene.add(rim);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.16, 0.07, 64), new THREE.MeshStandardMaterial({ color: 0x263e43, roughness: 0.95 }));
  platform.position.y = -0.045; scene.add(platform);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.09, 0.009, 6, 64), new THREE.MeshBasicMaterial({ color: 0x78b8aa }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.004; scene.add(ring);
  // Soft contact shadow, without a separate shadow-map pass per thumbnail.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.43, 32), new THREE.MeshBasicMaterial({ color: 0x0a171c, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.002; shadow.scale.y = 0.6; scene.add(shadow);
  const camera = new THREE.PerspectiveCamera(hero ? 34 : 36, 1, 0.1, 40);
  camera.position.set(hero ? 3.2 : 2.7, hero ? 2.7 : 2.4, hero ? 6.6 : 6.5);
  camera.lookAt(0, 1.35, 0);
  return { element, scene, avatar, camera, pose: createPose() };
}
const hero = createView($('#hero-view'), true);
const controls = new OrbitControls(hero.camera, hero.element);
controls.target.set(0, 1.35, 0);
controls.enablePan = false;
controls.minDistance = 4.1;
controls.maxDistance = 10;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI / 2 + 0.05;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.update(); controls.saveState();
hero.element.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const offset = hero.camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? -0.2 : 0.2);
  hero.camera.position.copy(controls.target).add(offset); controls.update();
});

let selected = MOTIONS[0];
let time = 0, galleryTime = 0, speed = 1;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let playing = !reducedMotion.matches;
let transitionFrom = null, transitionTime = 0;
const targetPose = createPose();
const thumbnails = MOTIONS.map((motion, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'motion-card';
  button.setAttribute('aria-pressed', String(index === 0));
  button.setAttribute('aria-label', `Preview ${motion.name}, ${motion.duration.toFixed(1)} second loop`);
  button.innerHTML = `<span class="card-number">${String(index + 1).padStart(2, '0')}</span><span class="card-selected" aria-hidden="true">↗</span><span class="thumbnail" aria-hidden="true"></span><span class="card-caption"><span class="card-title">${motion.name}</span><span class="card-duration">${motion.duration.toFixed(1)}s · loop</span></span>`;
  $('#motion-grid').append(button);
  const view = createView(button.querySelector('.thumbnail'));
  button.addEventListener('click', () => selectMotion(motion));
  return { ...view, motion, button };
});
$('#motion-count').textContent = `${MOTIONS.length} motions`;
function selectMotion(motion) {
  if (motion.id === selected.id) return;
  transitionFrom = structuredClone(hero.pose); transitionTime = 0;
  selected = motion; time = 0;
  if (!playing) transitionFrom = null;
  $('#motion-name').textContent = motion.name;
  $('#motion-description').textContent = motion.description;
  $('#motion-kind').textContent = motion.category;
  for (const view of thumbnails) view.button.setAttribute('aria-pressed', String(view.motion.id === motion.id));
  hero.element.setAttribute('aria-label', `${motion.name} animation on a generic Mii. Drag to rotate, use left and right arrow keys, or scroll to zoom.`);
  updateTimeline();
}
function updatePlayback() {
  $('#play-toggle').textContent = playing ? 'Pause' : 'Play';
  $('#play-toggle').setAttribute('aria-label', playing ? 'Pause all animation previews' : 'Play all animation previews');
  $('#stage-status').textContent = playing ? 'Playing' : 'Paused';
}
function updateTimeline() {
  $('#timeline').value = Math.round(time / selected.duration * 1000);
  $('#time-label').textContent = `${time.toFixed(2)} / ${selected.duration.toFixed(2)} s`;
  $('#timeline').setAttribute('aria-valuetext', `${time.toFixed(2)} of ${selected.duration.toFixed(2)} seconds`);
}
$('#play-toggle').addEventListener('click', () => { playing = !playing; updatePlayback(); });
$('#restart').addEventListener('click', () => { time = galleryTime = 0; transitionFrom = null; updateTimeline(); });
$('#speed').addEventListener('change', event => { speed = Number(event.target.value); });
$('#timeline').addEventListener('input', event => {
  playing = false; transitionFrom = null;
  time = Number(event.target.value) / 1000 * selected.duration;
  updatePlayback(); updateTimeline();
});
$('#reset-view').addEventListener('click', () => controls.reset());
reducedMotion.addEventListener('change', event => { if (event.matches) { playing = false; updatePlayback(); } });
updatePlayback();

let width = 0, height = 0;
function drawView(view) {
  const rect = view.element.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width || rect.width === 0 || rect.height === 0) return;
  // Keep the full viewport even for partially clipped cards: scissor clips it.
  renderer.setViewport(rect.left, height - rect.bottom, rect.width, rect.height);
  renderer.setScissor(Math.max(0, rect.left), Math.max(0, height - rect.bottom), Math.min(width, rect.right) - Math.max(0, rect.left), Math.min(height, rect.bottom) - Math.max(0, rect.top));
  view.camera.aspect = rect.width / rect.height;
  view.camera.updateProjectionMatrix();
  renderer.clearDepth(); renderer.render(view.scene, view.camera);
}
let previous = performance.now();
let stopped = false;
function render(now) {
  if (stopped) return;
  const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
  if (document.hidden) { requestAnimationFrame(render); return; }
  if (width !== innerWidth || height !== innerHeight) {
    width = innerWidth; height = innerHeight; renderer.setSize(width, height, false);
  }
  if (playing) {
    time = (time + dt * speed) % selected.duration;
    galleryTime += dt * speed;
    if (transitionFrom) transitionTime += dt;
  }
  sampleMotion(selected.id, time, targetPose);
  if (transitionFrom && transitionTime < 0.3) blendPoses(transitionFrom, targetPose, transitionTime / 0.3, hero.pose);
  else { transitionFrom = null; blendPoses(targetPose, targetPose, 1, hero.pose); }
  hero.avatar.applyPose(hero.pose);
  controls.update();
  renderer.setScissorTest(false); renderer.clear(); renderer.setScissorTest(true);
  drawView(hero);
  for (const view of thumbnails) {
    const rect = view.element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > height) continue;
    sampleMotion(view.motion.id, galleryTime, view.pose);
    view.avatar.applyPose(view.pose); drawView(view);
  }
  updateTimeline();
  requestAnimationFrame(render);
}
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); stopped = true;
  $('#error-message').hidden = false;
  $('#error-message').textContent = 'The 3D preview lost its graphics connection. Reload this page to continue.';
  $('#stage-status').textContent = 'Preview unavailable';
});
$('#loading').remove();
requestAnimationFrame(render);
