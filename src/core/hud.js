// The text overlay: runway in months, a month-by-month calendar that fills up, and the pot.
// Numbers count up/down on change; losses shake, donations float a "+€…" bubble.
import { config } from "../../config.js";

const euro = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const months = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const monthName = new Intl.DateTimeFormat(undefined, { month: "short" });
const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const DAYS_PER_MONTH = 30.44;

export function createHud(runway, { reducedMotion }) {
  const hud = document.querySelector(".hud");
  const monthsEl = document.getElementById("months");
  const fundsEl = document.getElementById("funds");
  const untilEl = document.getElementById("until");
  const metaEl = document.getElementById("meta");
  const calendarEl = document.getElementById("calendar");

  // One chip per month from now, up to the "healthy" runway.
  const count = config.healthyMonths;
  const today = new Date();
  const chips = [];
  for (let i = 0; i < count; i++) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.style.setProperty("--i", i);
    chip.innerHTML = `<i></i><b>${monthName.format(new Date(today.getFullYear(), today.getMonth() + i, 1)).slice(0, 3)}</b>`;
    calendarEl.append(chip);
    chips.push(chip);
  }
  const extra = document.createElement("span");
  extra.className = "chip-extra";
  calendarEl.append(extra);

  let shown = { months: 0, funds: 0 };
  let anim = 0;

  function render({ months: m, funds }) {
    monthsEl.textContent = Number.isFinite(m) ? months.format(m) : "∞";
    fundsEl.innerHTML = `<span class="emoji">💰</span> <strong>${euro.format(funds)}</strong> in the pot`
      + ` <span class="dot">·</span> <span class="emoji">🔥</span> ${euro.format(runway.state.monthlyCost)} / month`;
  }

  // Chips are calendar months starting with this one, so shift by how much of this month is already gone.
  const daysThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const elapsed = (today.getDate() - 1) / daysThisMonth;

  function fillCalendar(runwayMonths) {
    const m = runwayMonths + elapsed;
    const edge = Number.isFinite(m) ? Math.min(Math.floor(m), count - 1) : -1;
    chips.forEach((chip, i) => {
      const fill = Number.isFinite(m) ? Math.min(1, Math.max(0, m - i)) : 1;
      chip.style.setProperty("--fill", fill.toFixed(3));
      chip.classList.toggle("full", fill >= 1);
      chip.classList.toggle("edge", i === edge && fill < 1);
    });
    const more = Number.isFinite(m) ? Math.floor(m - count) : Infinity;
    extra.textContent = more >= 1 ? `+${Number.isFinite(more) ? more : "∞"}` : "";
    extra.hidden = !(more >= 1);
  }

  function describeUntil(m) {
    if (!Number.isFinite(m)) return "🎉 The office is safe. No end in sight!";
    if (m <= 0) return "😱 The pot is empty!";
    const end = new Date(today.getTime() + m * DAYS_PER_MONTH * 864e5);
    const part = end.getDate() <= 10 ? "early" : end.getDate() <= 20 ? "mid" : "late";
    return `🏠 Office safe until <strong>${part} ${monthYear.format(end)}</strong>`;
  }

  // Restart a one-shot CSS animation class.
  function play(el, cls) {
    if (reducedMotion) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function bubble(delta) {
    if (reducedMotion || !delta) return;
    const b = document.createElement("span");
    b.className = `bubble ${delta > 0 ? "up" : "down"}`;
    b.textContent = `${delta > 0 ? "+" : "−"}${euro.format(Math.abs(delta))}`;
    b.style.setProperty("--x", `${(Math.random() - 0.5) * 120}px`);
    b.style.top = `${fundsEl.offsetTop}px`;
    hud.append(b);
    b.addEventListener("animationend", () => b.remove());
  }

  runway.events.addEventListener("fundschange", ({ detail: { previous, current, delta } }) => {
    document.body.dataset.mood = current.mood;
    untilEl.innerHTML = describeUntil(current.runwayMonths);
    fillCalendar(current.runwayMonths);
    if (previous) {
      play(monthsEl, "pop");
      if (delta < 0) play(calendarEl, "shake");
      bubble(delta);
    }

    const target = { months: current.runwayMonths, funds: current.funds };
    cancelAnimationFrame(anim);
    if (reducedMotion || !Number.isFinite(target.months)) { shown = target; render(target); return; }
    const from = { ...shown }, start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 1200);
      const e = 1 - (1 - p) ** 3;
      shown = { months: from.months + (target.months - from.months) * e, funds: from.funds + (target.funds - from.funds) * e };
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
