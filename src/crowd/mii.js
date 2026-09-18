// PUBLIC API of the crowd workstream: turns an AvatarSpec into a 3D Mii.
// The avatar maker (tools/avatar-maker) imports this for its live preview, so keep the signature:
//   buildMii(spec: AvatarSpec) → THREE.Group   (feet at y = 0, facing +z, ~1 unit tall × spec.height)
// PLACEHOLDER: body capsule + head + hair cap + eyes. The crowd workstream replaces the internals.
import * as THREE from "three";

const color = (hex, fallback) => new THREE.Color(/^#[0-9a-f]{6}$/i.test(hex ?? "") ? hex : fallback);

/** @param {import("../contracts/avatar.js").AvatarSpec} spec */
export function buildMii(spec) {
  const mii = new THREE.Group();
  mii.name = `mii:${spec.id}`;

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.35, 4, 12),
    new THREE.MeshStandardMaterial({ color: color(spec.shirtColor, "#4488ff") }),
  );
  body.position.y = 0.4;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 20, 16),
    new THREE.MeshStandardMaterial({ color: color(spec.head?.skinTone, "#e0b090") }),
  );
  head.position.y = 0.9;

  if (spec.hair?.style !== "none") {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: color(spec.hair?.color, "#3a2a1a") }),
    );
    hair.position.y = 0.93;
    mii.add(hair);
  }

  const eyeMat = new THREE.MeshBasicMaterial({ color: color(spec.eyes?.color, "#222222") });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    eye.position.set(side * 0.09, 0.93, 0.23);
    mii.add(eye);
  }

  mii.add(body, head);
  mii.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  mii.scale.setScalar(spec.height ?? 1);
  return mii;
}
