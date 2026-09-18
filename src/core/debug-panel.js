// ?debug: fake the funds and give each module its own folder of knobs.
import GUI from "lil-gui";

export function createDebugPanel(runway, instances) {
  const gui = new GUI({ title: "Runway debug" });
  const s = runway.state;
  const fake = { funds: s.funds, monthlyCost: s.monthlyCost || 1000 };
  const push = () => runway.override(fake);

  const f = gui.addFolder("Funds");
  f.add(fake, "funds", 0, 20000, 100).name("funds €").onChange(push).listen();
  f.add(fake, "monthlyCost", 100, 5000, 50).name("monthly cost €").onChange(push);
  f.add({ lose: () => { fake.funds = Math.max(0, fake.funds - 1000); push(); } }, "lose").name("💸 lose €1,000");
  f.add({ donate: () => { fake.funds += 1000; push(); } }, "donate").name("💶 donate €1,000");
  f.add({ crash: () => { fake.funds = 500; push(); } }, "crash").name("🔥 crash to €500");
  f.add({ live: async () => { await runway.release(); Object.assign(fake, runway.state); } }, "live").name("↩ back to live data");

  const readout = { mood: "", health: "" };
  f.add(readout, "mood").disable().listen();
  f.add(readout, "health").disable().listen();
  setInterval(() => {
    readout.mood = runway.state.mood;
    readout.health = runway.state.health.toFixed(2);
  }, 200);

  for (const { name, instance } of instances) {
    if (instance.debugUI) instance.debugUI(gui.addFolder(name));
  }
}
