// Turns raw funds into RunwayState and announces changes on an EventTarget.
import { loadFunds } from "./data-source.js";
import { stressFromRunway, moodFromStress, monthsFromDelta, impulseFromMonths } from "./feelings.js";

/** @typedef {import("../contracts/module.js").RunwayState} RunwayState */

export function derive({ funds, monthlyCost, source }, config) {
  const runwayMonths = monthlyCost > 0 ? funds / monthlyCost : Infinity;
  const stress = stressFromRunway(runwayMonths, config.stress);
  return /** @type {RunwayState} */ (Object.freeze({
    funds, monthlyCost, runwayMonths, stress, health: 1 - stress, mood: moodFromStress(stress), source,
  }));
}

export function createRunway(config) {
  const events = new EventTarget();
  /** @type {RunwayState | null} */
  let state = null;
  let last = null;
  let overridden = false;
  let lastError = null;

  function set(input, { quiet = false } = {}) {
    last = input;
    const previous = state;
    state = derive(input, config);
    if (!previous || previous.funds !== state.funds || previous.monthlyCost !== state.monthlyCost) {
      const delta = previous ? state.funds - previous.funds : 0;
      const months = monthsFromDelta(delta, state.monthlyCost);
      events.dispatchEvent(new CustomEvent("fundschange", {
        detail: { previous, current: state, delta, months, impulse: quiet ? 0 : impulseFromMonths(months), quiet },
      }));
    }
  }

  async function refresh() {
    if (overridden) return;
    try {
      set(await loadFunds(config));
      lastError = null;
    } catch (err) {
      lastError = err;
      console.error("Couldn't load funds:", err);
      if (!state) set({ funds: 0, monthlyCost: 0, source: "offline" });
    }
  }

  return {
    events,
    get state() { return state; },
    get lastError() { return lastError; },
    get simulating() { return overridden; },
    refresh,
    start() { setInterval(refresh, config.refreshSeconds * 1000); },
    /** Simulation: pin the state to fake numbers. `quiet` skips reactions (for sliders and slow slides). */
    override(input, options) { overridden = true; set({ ...input, source: "debug" }, options); },
    /** Simulation: go back to live data. */
    release() { overridden = false; return refresh(); },
    /** Re-derive after tuning changes (e.g. the stress curve), without a reaction. */
    rederive() { if (last) { state = null; set(last, { quiet: true }); } },
  };
}
