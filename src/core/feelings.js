// Money → feelings. Pure math, no Three.js, so it's unit-tested (feelings.test.js).
//
//   stress   s = 1 / (1 + e^((R − midMonths) / width))       R = runway in months
//   impulse  e = sign(Δm) · min(1, log2(1 + |Δm|))           Δm = Δfunds / monthlyCost ("months bought/lost")
//   emotion  decays as e · exp(−t / emotionSeconds)
//   smoothed stress eases towards its target with time constant stressSeconds.

/** Logistic stress curve: ~0 when runway is long, ~1 when it's nearly gone. */
export function stressFromRunway(runwayMonths, { midMonths, width }) {
  if (!Number.isFinite(runwayMonths)) return 0;
  return 1 / (1 + Math.exp((runwayMonths - midMonths) / width));
}

/** How much a change in funds is worth, in months of runway. */
export function monthsFromDelta(delta, monthlyCost) {
  return monthlyCost > 0 ? delta / monthlyCost : 0;
}

/** Size of the emotional reaction, -1..1. A small donation still registers; a huge one caps at 1. */
export function impulseFromMonths(months) {
  if (!months) return 0;
  return Math.sign(months) * Math.min(1, Math.log2(1 + Math.abs(months)));
}

/** Mood bucket from stress, for CSS and simple consumers. */
export function moodFromStress(stress) {
  return stress >= 0.7 ? "panic" : stress >= 0.35 ? "worried" : stress >= 0.1 ? "calm" : "thriving";
}

/**
 * Per-frame smoothed feelings.
 * @param {{ stressSeconds: number, emotionSeconds: number }} tuning
 */
export function createFeelings(tuning) {
  let stress = null;
  let emotion = 0;
  return {
    /** Call on every fundschange with a real (non-startup) delta. */
    kick(impulse) {
      // Stack reactions, but never beyond ±1.
      emotion = Math.max(-1, Math.min(1, emotion + impulse));
    },
    /** @returns {{ stress: number, emotion: number }} */
    update(dt, targetStress) {
      stress = stress === null ? targetStress : stress + (targetStress - stress) * (1 - Math.exp(-dt / tuning.stressSeconds));
      emotion *= Math.exp(-dt / tuning.emotionSeconds);
      if (Math.abs(emotion) < 0.001) emotion = 0;
      return { stress, emotion };
    },
  };
}
