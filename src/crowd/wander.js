import { CROWD_INNER_RADIUS, CROWD_OUTER_RADIUS } from '../contracts/module.js';
import { seededRandom } from './standard.js';

const INNER = CROWD_INNER_RADIUS + 0.4;
const OUTER = CROWD_OUTER_RADIUS - 0.4;
const SPACE = 0.78;
const TAU = Math.PI * 2;

// Squared distance to a route; also checks the middle, not just endpoints.
export function segmentDistanceSquared(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length2)) : 0;
  return (px - ax - t * dx) ** 2 + (pz - az - t * dz) ** 2;
}
export function createWanderer(seed, position) {
  return { random: seededRandom(seed), x: position.x, z: position.z, walking: false };
}
function chooseDestination(resident, residents) {
  const { mii, wanderer } = resident;
  for (let attempt = 0; attempt < 18; attempt++) {
    const angle = wanderer.random() * TAU;
    const distance = 0.85 + wanderer.random() * 0.85;
    const x = mii.position.x + Math.sin(angle) * distance;
    const z = mii.position.z + Math.cos(angle) * distance;
    if (Math.hypot(x, z) > OUTER || segmentDistanceSquared(0, 0, mii.position.x, mii.position.z, x, z) < INNER * INNER) continue;
    let clear = true;
    for (const other of residents) {
      if (other === resident) continue;
      if (segmentDistanceSquared(other.mii.position.x, other.mii.position.z, mii.position.x, mii.position.z, x, z) < SPACE * SPACE) { clear = false; break; }
      if (other.wanderer.walking && Math.hypot(other.wanderer.x - x, other.wanderer.z - z) < SPACE) { clear = false; break; }
    }
    if (clear) { wanderer.x = x; wanderer.z = z; return true; }
  }
  return false;
}
export function updateWanderer(resident, residents, dt) {
  const { mii, controller, wanderer } = resident;
  if (controller.action !== 'walk') { wanderer.walking = false; return; }
  if (!wanderer.walking) {
    if (!chooseDestination(resident, residents)) { controller.finishActivity(); return; }
    wanderer.walking = true;
  }
  const dx = wanderer.x - mii.position.x, dz = wanderer.z - mii.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.025) { controller.finishActivity(); wanderer.walking = false; return; }
  const desired = Math.atan2(dx, dz);
  const turn = Math.atan2(Math.sin(desired - mii.rotation.y), Math.cos(desired - mii.rotation.y));
  const step = Math.max(0, Math.min(dt, 0.1));
  mii.rotation.y += turn * Math.min(1, step * 5);
  // Turn before moving, then ease into the stroll. Match speed to clip pacing.
  if (Math.abs(turn) > 0.35) return;
  const travel = Math.min(distance, step * 0.27 * controller.pace);
  const x = mii.position.x + dx / distance * travel;
  const z = mii.position.z + dz / distance * travel;
  for (const other of residents) {
    if (other !== resident && Math.hypot(other.mii.position.x - x, other.mii.position.z - z) < SPACE) {
      controller.finishActivity(); wanderer.walking = false; return;
    }
  }
  mii.position.x = x; mii.position.z = z;
}
