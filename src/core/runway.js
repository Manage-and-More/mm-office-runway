// Turns raw funds into RunwayState and announces changes on an EventTarget.
import { loadFunds } from "./data-source.js";

/** @typedef {import("../contracts/module.js").RunwayState} RunwayState */

export function derive({ funds, monthlyCost, source }, config) {
  const runwayMonths = monthlyCost > 0 ? funds / monthlyCost : Infinity;
  const health = Math.min(1, Math.max(0, runwayMonths / config.healthyMonths));
  const mood = config.moods.find((m) => runwayMonths < m.belowMonths)?.mood ?? "thriving";
  return /** @type {RunwayState} */ (Object.freeze({ funds, monthlyCost, runwayMonths, health, mood, source }));
}

export function createRunway(config) {
  const events = new EventTarget();
  /** @type {RunwayState | null} */
  let state = null;
  let overridden = false;
  let lastError = null;

  function set(input) {
    const previous = state;
    state = derive(input, config);
    if (!previous || previous.funds !== state.funds || previous.monthlyCost !== state.monthlyCost) {
      const delta = previous ? state.funds - previous.funds : 0;
      events.dispatchEvent(new CustomEvent("fundschange", { detail: { previous, current: state, delta } }));
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
    refresh,
    start() { setInterval(refresh, config.refreshSeconds * 1000); },
    /** Debug panel: pin the state to fake numbers. */
    override(input) { overridden = true; set({ ...input, source: "debug" }); },
    /** Debug panel: go back to live data. */
    release() { overridden = false; return refresh(); },
  };
}
