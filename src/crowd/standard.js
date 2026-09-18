// Independent character clocks, with a state boundary for future celebration/panic.
// Standard is deliberately the only implemented crowd state in this slice.
import { createPose, sampleMotion, blendPoses, MOTIONS } from './motions.js';
export const STANDARD_ACTIONS = ['idle', 'walk', 'eat', 'wave', 'cheer'];
const durations = Object.fromEntries(MOTIONS.map(motion => [motion.id, motion.duration]));
export function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ value >>> 15, value | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function chooseActivity(random) {
  const chance = random();
  return chance < 0.32 ? 'walk' : chance < 0.68 ? 'eat' : chance < 0.90 ? 'wave' : 'cheer';
}
function actionLength(action, random) {
  if (action === 'idle') return 7 + random() * 15;
  if (action === 'walk') return durations.walk * (3 + Math.floor(random() * 3));
  if (action === 'eat') return durations.eat * (random() < 0.65 ? 1 : 2);
  return durations[action];
}
export function createStandardController({ seed = 1, reducedMotion = false } = {}) {
  const random = seededRandom(seed);
  let action = reducedMotion || random() < 0.78 ? 'idle' : chooseActivity(random);
  let elapsed = random() * durations[action];
  let remaining = actionLength(action, random);
  const pace = reducedMotion ? 0.3 : 0.86 + random() * 0.28;
  const pose = createPose(), target = createPose(), from = createPose();
  let transition = 1;
  sampleMotion(action, elapsed, pose);
  function begin(next) {
    blendPoses(pose, pose, 1, from);
    action = next;
    elapsed = 0;
    remaining = actionLength(action, random);
    transition = 0;
  }
  return {
    pose,
    get action() { return action; },
    get pace() { return pace; },
    resumeFromPose(lastPose) { begin('idle'); blendPoses(lastPose, lastPose, 1, from); blendPoses(lastPose, lastPose, 1, pose); },
    finishActivity() { if (action !== 'idle') begin('idle'); },
    update(dt) {
      // The scheduler owns time; sampling itself stays deterministic and reusable.
      const step = Math.max(0, Math.min(dt, 0.1)) * pace;
      elapsed += step;
      remaining -= step;
      if (!reducedMotion && remaining <= 0) {
        begin(action === 'idle' ? chooseActivity(random) : 'idle');
      }
      transition = Math.min(1, transition + step / 0.45);
      sampleMotion(action, elapsed, target);
      blendPoses(from, target, transition, pose);
      return pose;
    },
  };
}
