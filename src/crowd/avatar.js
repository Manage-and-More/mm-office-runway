import * as THREE from 'three';
import { JOINTS } from './motions.js';

// Original rigid-part test avatar. Named THREE.Bone joints let us exercise
// hierarchical motion now; a future skinned avatar gets its own pose adapter.
const sphere = new THREE.SphereGeometry(1, 16, 12);
const materialCache = new Map();
const material = color => {
  if (!materialCache.has(color)) materialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.78 }));
  return materialCache.get(color);
};
const safeColor = (color, fallback) => /^#[0-9a-f]{6}$/i.test(color ?? '') ? color.toLowerCase() : fallback;
const capsuleCache = new Map();
const torsoGeometry = new THREE.CylinderGeometry(0.28, 0.32, 0.57, 16);
const capGeometry = new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.44);
const smileCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.10, -0.205, 0.365), new THREE.Vector3(0, -0.29, 0.395), new THREE.Vector3(0.10, -0.205, 0.365));
const smileGeometry = new THREE.TubeGeometry(smileCurve, 12, 0.012, 6, false);
const glassesGeometry = new THREE.TorusGeometry(0.098, 0.014, 5, 16);

const defaults = {
  skin: material('#f1be94'), blush: material('#e6a183'), hair: material('#342822'),
  shirt: material('#69d6b1'), collar: material('#3c9e83'), pants: material('#29384c'),
  shoe: material('#f0f0e8'), sole: material('#bbc8c8'), eye: material('#252c32'),
  white: material('#ffffff'), cookie: material('#d79650'), chocolate: material('#5f3726'),
};
function ellipsoid(parent, mat, xyz, scale) {
  const mesh = new THREE.Mesh(sphere, mat);
  mesh.position.set(...xyz); mesh.scale.set(...scale); parent.add(mesh);
  return mesh;
}
function capsule(parent, mat, length, radius, y = -length / 2) {
  const key = `${length}:${radius}`;
  if (!capsuleCache.has(key)) capsuleCache.set(key, new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, 8));
  const mesh = new THREE.Mesh(capsuleCache.get(key), mat);
  mesh.position.y = y; parent.add(mesh); return mesh;
}
export function createAvatar(spec = {}) {
  const materials = { ...defaults,
    skin: material(safeColor(spec.head?.skinTone, '#f1be94')),
    hair: material(safeColor(spec.hair?.color, '#342822')),
    shirt: material(safeColor(spec.shirtColor, '#69d6b1')),
    collar: material(safeColor(spec.shirtColor, '#69d6b1')),
    eye: material(safeColor(spec.eyes?.color, '#252c32')),
  };
  const root = new THREE.Group();
  const bones = {};
  function bone(name, parent, x, y, z = 0) {
    const joint = new THREE.Bone(); joint.name = name; joint.position.set(x, y, z);
    parent.add(joint); bones[name] = joint; return joint;
  }
  const hips = bone('hips', root, 0, 0.97);
  const spine = bone('spine', hips, 0, 0.15);
  ellipsoid(hips, materials.pants, [0, 0, 0], [0.29, 0.19, 0.2]);
  const torso = new THREE.Mesh(torsoGeometry, materials.shirt);
  torso.position.y = 0.23; torso.scale.z = 0.72; spine.add(torso);
  ellipsoid(spine, materials.shirt, [0, 0.51, 0], [0.275, 0.14, 0.19]);
  ellipsoid(spine, materials.collar, [0, 0.57, 0], [0.15, 0.04, 0.14]);
  capsule(spine, materials.skin, 0.22, 0.10, 0.65);
  const head = bone('head', spine, 0, 0.98);
  const candidateShape = { round: [0.48, 0.50, 0.40], oval: [0.45, 0.54, 0.40], square: [0.49, 0.49, 0.41], long: [0.43, 0.56, 0.40], heart: [0.47, 0.53, 0.40] }[spec.head?.shape];
  const shape = Array.isArray(candidateShape) ? candidateShape : [0.48, 0.54, 0.40];
  ellipsoid(head, materials.skin, [0, 0, 0], shape);
  for (const sign of [-1, 1]) {
    ellipsoid(head, materials.skin, [sign * 0.47, -0.03, 0], [0.09, 0.135, 0.08]);
    ellipsoid(head, materials.blush, [sign * 0.29, -0.15, 0.316], [0.07, 0.032, 0.012]);
  }
  // A hemisphere cap and a swept fringe preserve a readable face from all angles.
  const hair = new THREE.Group(); head.add(hair);
  const knownHair = ['none', 'buzz', 'short', 'sidepart', 'curly', 'afro', 'long', 'ponytail', 'bun'];
  const hairStyle = knownHair.includes(spec.hair?.style) ? spec.hair.style : 'sidepart';
  hair.visible = hairStyle !== 'none';
  const cap = new THREE.Mesh(capGeometry, materials.hair);
  cap.position.y = 0.06; cap.scale.set(0.493, 0.52, 0.415); hair.add(cap);
  const fringe = ellipsoid(hair, materials.hair, [-0.15, 0.31, 0.30], [0.31, 0.13, 0.13]);
  fringe.rotation.z = 0.28;
  ellipsoid(hair, materials.hair, [0.31, 0.24, 0.18], [0.13, 0.25, 0.15]);
  if (hairStyle === 'buzz') { fringe.visible = false; cap.scale.y = 0.49; }
  if (hairStyle === 'bun') ellipsoid(hair, materials.hair, [0, 0.48, -0.28], [0.22, 0.22, 0.21]);
  if (hairStyle === 'ponytail') ellipsoid(hair, materials.hair, [0, -0.12, -0.41], [0.17, 0.43, 0.17]);
  if (hairStyle === 'long') ellipsoid(hair, materials.hair, [0, -0.15, -0.23], [0.49, 0.48, 0.23]);
  if (hairStyle === 'curly' || hairStyle === 'afro') {
    for (let i = 0; i < 7; i++) {
      const angle = i / 6 * Math.PI;
      ellipsoid(hair, materials.hair, [Math.cos(angle) * 0.38, 0.22 + Math.sin(angle) * 0.3, 0.03], [0.20, 0.20, 0.35]);
    }
  }
  const eyes = [], brows = [];
  for (const sign of [-1, 1]) {
    const eye = ellipsoid(head, materials.eye, [sign * 0.165, 0.01, 0.375], [0.048, 0.076, 0.024]); eyes.push(eye);
    ellipsoid(eye, materials.white, [-0.22, 0.26, 0.85], [0.25, 0.22, 0.25]);
    const brow = ellipsoid(head, materials.hair, [sign * 0.165, 0.15, 0.366], [0.073, 0.018, 0.018]); brows.push(brow);
  }
  ellipsoid(head, materials.skin, [0, -0.075, 0.407], [0.069, 0.068, 0.078]);
  if (['round', 'square', 'sunglasses'].includes(spec.glasses)) {
    for (const sign of [-1, 1]) {
      const frame = new THREE.Mesh(glassesGeometry, materials.hair);
      frame.position.set(sign * 0.165, 0.01, 0.417); head.add(frame);
      if (spec.glasses === 'sunglasses') ellipsoid(head, materials.hair, [sign * 0.165, 0.01, 0.42], [0.09, 0.075, 0.014]);
    }
    ellipsoid(head, materials.hair, [0, 0.035, 0.42], [0.07, 0.012, 0.014]);
  }
  if (['beard', 'stubble'].includes(spec.facialHair)) ellipsoid(head, materials.hair, [0, -0.34, 0.225], [0.26, 0.16, 0.11]);
  if (spec.facialHair === 'mustache') ellipsoid(head, materials.hair, [0, -0.17, 0.37], [0.13, 0.035, 0.024]);
  const smile = new THREE.Mesh(smileGeometry, defaults.eye); head.add(smile);
  const mouth = ellipsoid(head, defaults.eye, [0, -0.235, 0.37], [0.077, 0.07, 0.025]);
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const arm = bone(`${side}UpperArm`, spine, sign * 0.30, 0.49);
    capsule(arm, materials.shirt, 0.27, 0.105, -0.095);
    capsule(arm, materials.skin, 0.33, 0.078);
    const forearm = bone(`${side}Forearm`, arm, 0, -0.35);
    capsule(forearm, materials.skin, 0.30, 0.074);
    const hand = bone(`${side}Hand`, forearm, 0, -0.31);
    ellipsoid(hand, materials.skin, [0, -0.045, 0], [0.09, 0.105, 0.08]);
    const thigh = bone(`${side}Thigh`, hips, sign * 0.15, -0.05);
    capsule(thigh, materials.pants, 0.40, 0.115);
    const shin = bone(`${side}Shin`, thigh, 0, -0.40);
    capsule(shin, materials.pants, 0.34, 0.095);
    const foot = bone(`${side}Foot`, shin, 0, -0.34);
    ellipsoid(foot, materials.sole, [0, -0.12, 0.065], [0.128, 0.043, 0.22]);
    ellipsoid(foot, materials.shoe, [0, -0.075, 0.065], [0.125, 0.077, 0.215]);
  }
  const food = new THREE.Group();
  food.position.set(0, -0.13, 0.025); bones.rightHand.add(food);
  ellipsoid(food, materials.cookie, [0, 0, 0], [0.135, 0.13, 0.035]);
  for (const [x, y] of [[-0.05, 0.055], [0.05, 0.02], [-0.025, -0.06], [0.065, -0.055]]) ellipsoid(food, materials.chocolate, [x, y, 0.032], [0.018, 0.02, 0.01]);
  const restHipsY = hips.position.y;
  let expression = 0;
  function applyPose(pose) {
    for (const name of JOINTS) { const r = pose.joints[name]; bones[name].rotation.set(r[0], r[1], r[2]); }
    hips.position.set(pose.root[0] * 2.7, restHipsY + pose.root[1] * 2.7, pose.root[2] * 2.7);
    for (const eye of eyes) eye.scale.y = 0.076 * (1 - 0.94 * pose.blink);
    brows[0].rotation.z = -Math.max(expression, pose.worried) * 0.35;
    brows[1].rotation.z = Math.max(expression, pose.worried) * 0.35;
    mouth.visible = pose.mouth > 0.12; smile.visible = !mouth.visible;
    mouth.scale.y = 0.025 + 0.07 * pose.mouth;
    food.visible = pose.food > 0.01; food.scale.setScalar(pose.food);
  }
  return { root, bones, applyPose, setMood(mood) { expression = mood === 'worried' || mood === 'panic' ? 1 : 0; } };
}
