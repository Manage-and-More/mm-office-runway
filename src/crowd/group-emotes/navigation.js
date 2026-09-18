import { CROWD_INNER_RADIUS, CROWD_OUTER_RADIUS } from '../../contracts/module.js';
import { segmentDistanceSquared } from '../wander.js';

const INNER = CROWD_INNER_RADIUS + 0.4, OUTER = CROWD_OUTER_RADIUS - 0.4;
const SPACE = 0.78;
const STEERING = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35];
export function moveToSlot(actor, actors, dt, navigation) {
  const position = actor.resident.mii.position, finalTarget = actor.target;
  let target = actor.route?.[actor.waypoint] ?? finalTarget;
  if (actor.route && Math.hypot(target.x - position.x, target.z - position.z) < 0.09 && actor.waypoint < actor.route.length - 1) target = actor.route[++actor.waypoint];
  const dx = target.x - position.x, dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.10 && (!actor.route || actor.waypoint === actor.route.length - 1)) return true;
  // Route around the protected garden rather than across its central disk.
  let heading = Math.atan2(dx, dz);
  if (!navigation && segmentDistanceSquared(0, 0, position.x, position.z, target.x, target.z) < INNER * INNER) {
    const angle = Math.atan2(position.x, position.z), end = Math.atan2(target.x, target.z);
    const difference = Math.atan2(Math.sin(end - angle), Math.cos(end - angle));
    heading = angle + Math.sign(difference || 1) * Math.PI / 2;
  }
  const step = Math.min(distance, 0.72 * dt);
  for (const offset of STEERING) {
    const direction = heading + offset;
    const x = position.x + Math.sin(direction) * step, z = position.z + Math.cos(direction) * step;
    const radius = Math.hypot(x, z);
    if (radius > OUTER || (navigation ? !navigation.segmentClear(position.x, position.z, x, z) : radius < INNER)) continue;
    let free = true;
    for (const other of actors) {
      if (other === actor) continue;
      const p = other.resident.mii.position;
      if (Math.hypot(p.x - x, p.z - z) < SPACE) { free = false; break; }
    }
    if (!free) continue;
    position.x = x; position.z = z;
    turnToward(actor.resident.mii, direction, dt);
    return false;
  }
  return false;
}
export function turnToward(mii, heading, dt) {
  const delta = Math.atan2(Math.sin(heading - mii.rotation.y), Math.cos(heading - mii.rotation.y));
  mii.rotation.y += delta * Math.min(1, dt * 6);
}
