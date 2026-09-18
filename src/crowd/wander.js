import { CROWD_INNER_RADIUS, CROWD_OUTER_RADIUS } from '../contracts/module.js';
import { seededRandom } from './standard.js';
import { TRAVEL, travelSpeed, strideScale, cohesionChance, SCATTER_FROM } from './mood.js';

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
// Where to head next. With resident.stress set (mood mode), calm residents drift over to hang out
// next to someone (cohesion) and scared ones dash away from the local crowd (scatter).
function preferredHeading(resident, residents, s) {
  const { mii, wanderer } = resident;
  const cohesive = wanderer.random() < cohesionChance(s);
  let nearest = null, nearestDistance = 4, cx = 0, cz = 0, n = 0;
  for (const other of residents) {
    if (other === resident) continue;
    const dx = other.mii.position.x - mii.position.x, dz = other.mii.position.z - mii.position.z;
    const d = Math.hypot(dx, dz);
    if (d < nearestDistance) { nearest = { dx, dz, d }; nearestDistance = d; }
    if (d < 3) { cx += dx; cz += dz; n++; }
  }
  if (cohesive && nearest && nearest.d > 1.3) {
    return { angle: Math.atan2(nearest.dx, nearest.dz) + (wanderer.random() - 0.5) * 0.6, distance: Math.min(3, nearest.d - 1) };
  }
  if (s > SCATTER_FROM && n > 0) {
    return { angle: Math.atan2(-cx, -cz) + (wanderer.random() - 0.5) * 1.8, distance: null };
  }
  return null;
}
function chooseDestination(resident, residents, navigation) {
  const { mii, wanderer, controller } = resident;
  const s = resident.stress;
  const mood = typeof s === 'number';
  const preferred = mood ? preferredHeading(resident, residents, s) : null;
  const stride = mood ? strideScale(controller.action === 'walk' ? s * 0.5 : s) : 1;
  for (let attempt = 0; attempt < 18; attempt++) {
    let angle = wanderer.random() * TAU;
    let distance = 0.85 + wanderer.random() * 0.85;
    if (mood) {
      if (preferred && attempt < 6) { angle = preferred.angle + (wanderer.random() - 0.5) * 0.3 * attempt; distance = preferred.distance ?? distance * stride; }
      else distance *= stride;
      distance *= 1 - attempt / 20; // long dashes are often blocked: shrink until something fits
    }
    const x = mii.position.x + Math.sin(angle) * distance;
    const z = mii.position.z + Math.cos(angle) * distance;
    if (Math.hypot(x, z) > OUTER) continue;
    const route = navigation ? navigation.findPath(mii.position, { x, z }) : null;
    if (navigation ? !route : segmentDistanceSquared(0, 0, mii.position.x, mii.position.z, x, z) < INNER * INNER) continue;
    let clear = true;
    for (const other of residents) {
      if (other === resident) continue;
      if (segmentDistanceSquared(other.mii.position.x, other.mii.position.z, mii.position.x, mii.position.z, x, z) < SPACE * SPACE) { clear = false; break; }
      if (other.wanderer.walking && Math.hypot(other.wanderer.x - x, other.wanderer.z - z) < SPACE) { clear = false; break; }
    }
    if (clear) { wanderer.x = x; wanderer.z = z; wanderer.route = route; wanderer.waypoint = 0; return true; }
  }
  return false;
}
export function updateWanderer(resident, residents, dt, navigation) {
  const { mii, controller, wanderer } = resident;
  const s = typeof resident.stress === 'number' ? resident.stress : null;
  const moving = s === null ? controller.action === 'walk' : Object.hasOwn(TRAVEL, controller.action);
  if (!moving) { wanderer.walking = false; return; }
  // Runners keep running: when they arrive or get blocked they pick a new spot instead of stopping.
  const dashing = controller.action === 'run' || controller.action === 'panic';
  const stop = () => { if (!dashing) controller.finishActivity(); wanderer.walking = false; };
  if (!wanderer.walking) {
    if (!chooseDestination(resident, residents, navigation)) { controller.finishActivity(); return; }
    wanderer.walking = true;
  }
  let target = wanderer.route?.[wanderer.waypoint] ?? wanderer;
  if (wanderer.route && Math.hypot(target.x - mii.position.x, target.z - mii.position.z) < 0.06 && wanderer.waypoint < wanderer.route.length - 1) target = wanderer.route[++wanderer.waypoint];
  const dx = target.x - mii.position.x, dz = target.z - mii.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.025) { stop(); return; }
  const desired = Math.atan2(dx, dz);
  const turn = Math.atan2(Math.sin(desired - mii.rotation.y), Math.cos(desired - mii.rotation.y));
  const step = Math.max(0, Math.min(dt, 0.1));
  mii.rotation.y += turn * Math.min(1, step * 5 * (1 + 2 * (s ?? 0)));
  // Turn before moving, then ease into the stroll. Match speed to clip pacing. Scared residents turn on the run.
  if (Math.abs(turn) > 0.35 + 0.5 * (s ?? 0)) return;
  const speed = s === null ? 0.27 : travelSpeed(controller.action, s);
  const travel = Math.min(distance, step * speed * controller.pace);
  const x = mii.position.x + dx / distance * travel;
  const z = mii.position.z + dz / distance * travel;
  if (navigation && !navigation.segmentClear(mii.position.x, mii.position.z, x, z)) { stop(); return; }
  for (const other of residents) {
    if (other !== resident && Math.hypot(other.mii.position.x - x, other.mii.position.z - z) < SPACE) {
      stop(); return;
    }
  }
  mii.position.x = x; mii.position.z = z;
}
