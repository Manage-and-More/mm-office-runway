// The text overlay: runway in months plus funds. Counts up/down on change.

const euro = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const months = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function createHud(runway, { reducedMotion }) {
  const monthsEl = document.getElementById("months");
  const fundsEl = document.getElementById("funds");
  const metaEl = document.getElementById("meta");
  let shown = 0;
  let anim = 0;

  function render(value) {
    monthsEl.textContent = Number.isFinite(value) ? months.format(value) : "∞";
  }

  runway.events.addEventListener("fundschange", ({ detail: { current } }) => {
    fundsEl.textContent = `${euro.format(current.funds)} in the pot · ${euro.format(current.monthlyCost)} / month`;
    document.body.dataset.mood = current.mood;
    const target = current.runwayMonths;
    cancelAnimationFrame(anim);
    if (reducedMotion || !Number.isFinite(target)) { shown = target; render(target); return; }
    const from = shown, start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 1200);
      shown = from + (target - from) * (1 - (1 - p) ** 3);
      render(shown);
      if (p < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  });

  return {
    tick() {
      const s = runway.state;
      metaEl.textContent = runway.lastError
        ? "Couldn't reach the data source. Showing the last known numbers."
        : s?.source === "debug" ? "DEBUG: fake numbers" : "";
    },
  };
}
