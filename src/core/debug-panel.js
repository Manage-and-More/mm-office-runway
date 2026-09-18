// The Simulate panel: fake the money to trigger every animation, on the live site too.
// Opened by the 🎛 button (or ?debug). Everything goes through runway.override(), the same path
// real sheet updates take, so what you see here is exactly what a real donation would do.
import GUI from "lil-gui";

export function createDebugPanel(runway, instances, config) {
  const gui = new GUI({ title: "🎛 Simulate" });
  const burn = () => runway.state.monthlyCost || 1000;
  const sim = {
    months: round(runway.state.runwayMonths),
    monthlyCost: runway.state.monthlyCost || 1000,
  };
  let story = null;

  function stopStory() { clearTimeout(story); story = null; }
  function setMonths(m, options) {
    sim.months = round(Math.max(0, m));
    runway.override({ funds: Math.round(sim.months * sim.monthlyCost), monthlyCost: sim.monthlyCost }, options);
  }
  function move(monthsDelta) { stopStory(); setMonths(runway.state.runwayMonths + monthsDelta); }
  function moveEuro(euro) { stopStory(); setMonths(runway.state.runwayMonths + euro / burn()); }

  const money = gui.addFolder("Money");
  money.add(sim, "months", 0, 15, 0.1).name("runway (months)").listen()
    .onChange((m) => { stopStory(); setMonths(m, { quiet: true }); });
  money.add({ a: () => moveEuro(200) }, "a").name("💶 donate €200");
  money.add({ a: () => move(1) }, "a").name("🎉 donate 1 month");
  money.add({ a: () => move(3) }, "a").name("🤑 donate 3 months");
  money.add({ a: () => move(-1) }, "a").name("💸 lose 1 month");
  money.add({ a: () => { stopStory(); setMonths(0.6); } }, "a").name("🔥 crash to 0.6 months");
  money.add({ a: () => { stopStory(); setMonths(12); } }, "a").name("🌞 jump to 12 months");
  money.add({ a: playStory }, "a").name("▶ story mode (40 s)");
  money.add({ a: async () => { stopStory(); await runway.release(); sim.months = round(runway.state.runwayMonths); } }, "a")
    .name("↩ back to live data");

  const readout = { stress: "", mood: "" };
  money.add(readout, "stress").disable().listen();
  money.add(readout, "mood").disable().listen();
  setInterval(() => {
    readout.stress = runway.state.stress.toFixed(2);
    readout.mood = runway.state.mood;
  }, 200);

  const tune = gui.addFolder("Stress curve").close();
  tune.add(config.stress, "midMonths", 0.5, 8, 0.1).name("sweat point (months)").onChange(() => runway.rederive());
  tune.add(config.stress, "width", 0.3, 4, 0.1).name("curve width").onChange(() => runway.rederive());
  tune.add(config.feelings, "stressSeconds", 0.2, 10, 0.1).name("stress easing (s)");
  tune.add(config.feelings, "emotionSeconds", 1, 20, 0.5).name("reaction fade (s)");

  for (const { name, instance } of instances) {
    if (instance.debugUI) instance.debugUI(gui.addFolder(name).close());
  }

  // A scripted demo: good times → slow decline → crash → rescue donations.
  function playStory() {
    stopStory();
    const steps = [
      [0, () => setMonths(12)],
      [5000, () => slide(12, 2, 10000)],
      [15500, () => move(-1)],
      [21000, () => setMonths(runway.state.runwayMonths + 1 / 30 * 3)], // a tiny donation: 3 days
      [25000, () => setMonths(runway.state.runwayMonths + 3)],
      [30000, () => setMonths(runway.state.runwayMonths + 6)],
    ];
    const t0 = performance.now();
    const run = (i) => {
      if (i >= steps.length) { story = null; return; }
      const [at, action] = steps[i];
      story = setTimeout(() => { action(); run(i + 1); }, Math.max(0, at - (performance.now() - t0)));
    };
    run(0);
  }
  function slide(from, to, ms) {
    const start = performance.now();
    const tick = () => {
      if (!story) return;
      const p = Math.min(1, (performance.now() - start) / ms);
      setMonths(from + (to - from) * p, { quiet: true });
      if (p < 1) setTimeout(tick, 250);
    };
    tick();
  }

  return gui;
}

function round(m) {
  return Number.isFinite(m) ? Math.round(m * 10) / 10 : 15;
}
