// Stress → crowd behaviour. Pure functions of s (0 = relaxed, 1 = full panic); tested in mood.test.js.
// Tune the numbers here; standard.js, wander.js and index.js only call these.

export const MOOD_ACTIONS = ['walk', 'eat', 'wave', 'cheer', 'dance', 'run', 'panic'];

/** Relative chance of each activity when a resident picks its next one. */
export function activityWeights(s) {
  const calm = 1 - s;
  return {
    walk: 0.32,
    eat: 0.36 * calm * calm, // snacks only when comfortable
    wave: 0.22 * calm,
    cheer: 0.10 * calm * calm,
    dance: 0.25 * Math.max(0, 1 - 4 * s), // only in good times
    run: 1.5 * s * s,
    panic: 12 * Math.max(0, s - 0.5) ** 2, // flailing kicks in past the midpoint
  };
}

export function chooseWeighted(weights, random) {
  let total = 0;
  for (const key in weights) total += weights[key];
  let pick = random() * total;
  for (const key in weights) if ((pick -= weights[key]) < 0) return key;
  return 'walk';
}

/** Idle stretches get shorter under stress: nobody daydreams when the rent is due. */
export const idleScale = s => 1 - 0.85 * s;
/** Animation tempo: barely changes until it gets serious. */
export const tempo = s => 1 + 1.5 * s * s;
/** After an activity, chance of going straight into another one instead of idling. */
export const restlessness = s => s;

/** Ground speed in units/second before per-character pace. */
export const TRAVEL = { walk: 0.27, run: 0.95, panic: 1.1 };
export const travelSpeed = (action, s) => (TRAVEL[action] ?? 0) * (1 + 1.5 * s * s);
/** How far a resident heads in one go: short strolls when calm, long dashes when scared. */
export const strideScale = s => 1 + 4 * s;
/** Chance a new destination is "go hang out next to someone" (cohesion). */
export const cohesionChance = s => 0.6 * (1 - s) ** 2;
/** Above this, destinations point away from the local crowd (scatter). */
export const SCATTER_FROM = 0.5;

/** Each resident's personal offset: some are worriers, some stay chill. ~N(0, 0.1), from a seeded random. */
export function personalThreshold(random) {
  return (random() + random() + random() - 1.5) * 0.2;
}

/**
 * Contagion: personal stress relaxes towards the crowd's stress (+ own threshold),
 * pulled by nearby residents. Panic ripples instead of flipping everyone at once.
 *   ds/dt = [(target − s) + alpha · (neighbourMean − s)] / tau
 */
export function stepStress(s, target, neighbourMean, dt, { tau = 2.5, alpha = 1.5 } = {}) {
  const pull = neighbourMean === null ? 0 : alpha * (neighbourMean - s);
  const next = s + ((target - s) + pull) * Math.min(1, dt / tau);
  return Math.max(0, Math.min(1, next));
}

/** A donation/loss spreads out from the logo as a wave at this many units per second. */
export const WAVE_SPEED = 4;
/** Share of the crowd that visibly reacts to an impulse of this size. */
export const reactionShare = impulse => Math.min(1, 0.15 + Math.abs(impulse));
