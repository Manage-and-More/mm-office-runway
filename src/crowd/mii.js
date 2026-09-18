// PUBLIC API: buildMii(AvatarSpec) → Group, facing +Z, feet at Y=0,
// approximately one unit tall × spec.height. Used by the avatar maker too.
import * as THREE from 'three';
import { createAvatar } from './avatar.js';
import { createPose, sampleMotion } from './motions.js';

/** @param {import('../contracts/avatar.js').AvatarSpec} spec */
export function buildMii(spec = {}) {
  const avatar = createAvatar(spec);
  const mii = new THREE.Group();
  mii.name = `mii:${spec.id ?? 'generic'}`;
  mii.add(avatar.root);
  const height = Number.isFinite(spec.height) ? Math.max(0.8, Math.min(1.2, spec.height)) : 1;
  mii.scale.setScalar(height / 2.7);
  const pose = createPose();
  avatar.applyPose(sampleMotion('idle', 0, pose));
  mii.userData.applyPose = avatar.applyPose;
  mii.userData.setMood = avatar.setMood;
  mii.userData.joints = avatar.bones;
  mii.traverse(object => { if (object.isMesh) object.castShadow = true; });
  return mii;
}
