// Moving out and coming back. When the runway is nearly gone, Miis pick up a cardboard box and
// walk sadly off the island edge, one by one. When money comes in (or stress drops), they run
// back in and cheer. No Three.js here so it's unit-testable; index.js supplies the box toggle.
import { CROWD_OUTER_RADIUS } from '../contracts/module.js';

export const LEAVE_ABOVE = 0.82; // stress at which people start leaving
export const RETURN_BELOW = 0.65; // ...and at which they come back (hysteresis, so nobody flip-flops)
export const EXIT_RADIUS = CROWD_OUTER_RADIUS + 2.3; // just past the island's rim
const WALK_OUT_SPEED = 0.55;
const RUN_BACK_SPEED = 2.4;
const TAU = Math.PI * 2;

/** Share of the crowd that leaves at a given stress: 0 at LEAVE_ABOVE, ~75% at 1. */
export const leaveShare = s => Math.max(0, Math.min(1, (s - LEAVE_ABOVE) / (1 - LEAVE_ABOVE))) * 0.75;

export function createExodus({ residents, random, setBox = () => {}, reducedMotion = false }) {
  let mode = 'home'; // home | leaving
  let timer = 0;

  const away = () => residents.filter(r => r.away);
  const outward = (mii) => {
    const a = Math.atan2(mii.position.x, mii.position.z) + (random() - 0.5) * 0.5;
    return { x: Math.sin(a) * EXIT_RADIUS, z: Math.cos(a) * EXIT_RADIUS };
  };

  function startLeaving(resident) {
    resident.away = { phase: 'leaving', exit: outward(resident.mii), home: { x: resident.mii.position.x, z: resident.mii.position.z } };
    resident.reaction = null;
    resident.wanderer.walking = false;
    resident.controller.react('walk', 100000);
    setBox(resident, true);
  }
  function startReturning(resident) {
    const a = resident.away;
    if (a.phase === 'gone') {
      resident.mii.visible = true;
      resident.mii.position.x = a.exit.x; resident.mii.position.z = a.exit.z;
    }
    a.phase = 'returning';
    setBox(resident, false);
    resident.controller.react('run', 100000);
  }
  function arrive(resident) {
    resident.away = null;
    resident.wanderer.walking = false;
    resident.controller.react('cheer', 2);
  }

  function moveToward(resident, target, speed, dt) {
    const { mii } = resident;
    const dx = target.x - mii.position.x, dz = target.z - mii.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt * (reducedMotion ? 0.4 : 1));
    mii.position.x += dx / d * step; mii.position.z += dz / d * step;
    const desired = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(desired - mii.rotation.y), Math.cos(desired - mii.rotation.y));
    mii.rotation.y += turn * Math.min(1, dt * 6);
    return false;
  }

  return {
    /** Everyone comes back right now (a donation arrived). */
    recall() {
      mode = 'home';
      for (const r of residents) if (r.away && r.away.phase !== 'returning') startReturning(r);
    },
    get awayCount() { return away().length; },
    /** Call every frame with the crowd's smoothed stress. Returns residents it moved (skip the wanderer for them). */
    update(dt, stress) {
      if (mode === 'home' && stress > LEAVE_ABOVE) mode = 'leaving';
      if (mode === 'leaving' && stress < RETURN_BELOW) { mode = 'home'; this.recall(); }
      timer -= dt;
      if (timer <= 0) {
        timer = mode === 'leaving' ? 0.9 + random() * 0.8 : 0.35;
        if (mode === 'leaving') {
          const wanted = Math.round(leaveShare(stress) * residents.length);
          if (away().length < wanted) {
            const candidates = residents.filter(r => !r.away);
            if (candidates.length) startLeaving(candidates[Math.floor(random() * candidates.length)]);
          }
        }
      }
      for (const r of residents) {
        const a = r.away;
        if (!a) continue;
        if (a.phase === 'leaving') {
          // Carry the box: arms forward, head down.
          const j = r.controller.pose.joints;
          j.leftUpperArm[0] = j.rightUpperArm[0] = -1.35; j.leftUpperArm[2] = 0.15; j.rightUpperArm[2] = -0.15;
          j.leftForearm[0] = j.rightForearm[0] = -0.35; j.head[0] = 0.22;
          r.controller.pose.worried = 1;
          if (moveToward(r, a.exit, WALK_OUT_SPEED, dt)) { a.phase = 'gone'; r.mii.visible = false; }
        } else if (a.phase === 'returning') {
          if (moveToward(r, a.home, RUN_BACK_SPEED, dt)) arrive(r);
        }
      }
    },
  };
}
