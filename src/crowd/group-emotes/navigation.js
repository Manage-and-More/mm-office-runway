import { CROWD_INNER_RADIUS, CROWD_OUTER_RADIUS } from '../../contracts/module.js';
import { segmentDistanceSquared } from '../wander.js';

const INNER = CROWD_INNER_RADIUS + 0.4, OUTER = CROWD_OUTER_RADIUS - 0.4;
const SPACE = 0.78;
const STEERING = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.25, -2.25];
// Someone who hasn't covered STALL_STEP within STALL_WINDOW is boxed in, most
// often behind residents who already reached their slots. Try a few routes that
// treat them as obstacles, then settle where we stand instead of thrashing.
const STALL_WINDOW = 2, STALL_STEP = 0.3, REPLAN_LIMIT = 3;

/** Clears the per-phase navigation state, so a new formation starts fresh. */
export function resetNavigation(actor) {
  actor.route = null;
  actor.waypoint = 0;
  actor.stalled = 0;
  actor.replans = 0;
  actor.settled = false;
  actor.watchX = undefined;
  actor.watchZ = undefined;
}

/** @returns {"arrived"|"moving"|"stuck"} */
export function moveToSlot(actor, actors, dt, navigation) {
  const position = actor.resident.mii.position, destination = actor.target;
  if (actor.settled) return 'stuck';

  actor.stalled = (actor.stalled ?? 0) + dt;
  if (actor.stalled >= STALL_WINDOW) {
    const moved = actor.watchX === undefined
      ? Infinity
      : Math.hypot(position.x - actor.watchX, position.z - actor.watchZ);
    if (moved < STALL_STEP) {
      if (navigation && (actor.replans ?? 0) < REPLAN_LIMIT) {
        actor.replans = (actor.replans ?? 0) + 1;
        const crowd = actors.filter(other => other !== actor).map(other => other.resident.mii.position);
        const route = navigation.findPath(position, destination, crowd) ?? navigation.findPath(position, destination);
        if (route) { actor.route = route; actor.waypoint = 0; }
      } else {
        // Best effort: the phase carries on and this resident dances in place.
        actor.settled = true;
        return 'stuck';
      }
    }
    actor.watchX = position.x; actor.watchZ = position.z; actor.stalled = 0;
  }

  let target = actor.route?.[actor.waypoint] ?? destination;
  if (actor.route && Math.hypot(target.x - position.x, target.z - position.z) < 0.09 && actor.waypoint < actor.route.length - 1) {
    target = actor.route[++actor.waypoint];
  }
  // Local avoidance can push someone off the planned corridor. Replan from the
  // real position instead of steering into the same planting bed every frame.
  if (navigation && !navigation.segmentClear(position.x, position.z, target.x, target.z)) {
    const route = navigation.findPath(position, destination);
    if (!route) return 'moving';
    actor.route = route; actor.waypoint = 0; target = route[0];
  }
  const dx = target.x - position.x, dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.10 && (!actor.route || actor.waypoint === actor.route.length - 1)) return 'arrived';

  let heading = Math.atan2(dx, dz);
  // Without the shared navigation service, keep clear of the centre by hand.
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
    return 'moving';
  }
  return 'moving';
}

export function turnToward(mii, heading, dt) {
  const delta = Math.atan2(Math.sin(heading - mii.rotation.y), Math.cos(heading - mii.rotation.y));
  mii.rotation.y += delta * Math.min(1, dt * 6);
}
