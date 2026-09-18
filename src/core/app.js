// Boots the page: stage → data → avatars → modules → render loop.
// A module that throws is logged and skipped, so one broken workstream never blanks the page.
import * as THREE from "three";
import { config } from "../../config.js";
import { modules } from "../modules.js";
import { createStage } from "./stage.js";
import { createRunway } from "./runway.js";
import { loadAvatars } from "./avatars.js";
import { createNavigation } from "./navigation.js";
import { createHud } from "./hud.js";
import { createFeelings } from "./feelings.js";
import { createEffects } from "./effects.js";

const params = new URLSearchParams(location.search);
const only = params.get("only")?.split(","); // ?only=logo or ?only=crowd — work on one module in isolation
const debug = params.has("debug");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

async function start() {
  const stage = createStage(document.getElementById("scene"));
  const runway = createRunway(config);
  const hud = createHud(runway, { reducedMotion });
  const feelings = createFeelings(config.feelings);
  const effects = createEffects({ reducedMotion });
  runway.events.addEventListener("fundschange", ({ detail }) => {
    if (detail.impulse) { feelings.kick(detail.impulse); effects.impulse(detail.impulse); }
    if (detail.impulse > 0) stage.celebrate(detail.impulse);
  });
  const [avatars] = await Promise.all([loadAvatars(config.avatarIndexUrl), runway.refresh()]);

  const navigation = createNavigation();
  const active = [];
  for (const name of modules) {
    if (only && !only.includes(name)) continue;
    const root = new THREE.Group();
    root.name = name;
    stage.scene.add(root);
    try {
      const { default: create } = await import(`../${name}/index.js`);
      /** @type {import("../contracts/module.js").ModuleContext} */
      const ctx = {
        scene: stage.scene,
        root,
        camera: stage.camera,
        renderer: stage.renderer,
        events: runway.events,
        navigation,
        avatars,
        assetBase: new URL(`../../assets/${name}/`, import.meta.url),
        reducedMotion,
        debug,
      };
      const instance = await create(ctx);
      active.push({ name, instance });
    } catch (err) {
      console.error(`[${name}] failed to start, skipping it:`, err);
      stage.scene.remove(root);
    }
  }
  // The first load happened before modules subscribed: replay it once so everyone starts in sync.
  runway.events.dispatchEvent(new CustomEvent("fundschange", {
    detail: { previous: null, current: runway.state, delta: 0, months: 0, impulse: 0, quiet: true },
  }));

  runway.start();
  addSimulateButton(runway, active, { open: debug });
  addPanicButton(runway);

  const clock = new THREE.Clock();
  stage.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const state = runway.state;
    const frame = { dt, time: clock.elapsedTime, state, feelings: feelings.update(dt, state.stress) };
    stage.setStress(reducedMotion ? state.stress : frame.feelings.stress);
    effects.update(dt, frame.feelings.stress);
    for (let i = active.length - 1; i >= 0; i--) {
      try {
        active[i].instance.update(frame);
      } catch (err) {
        console.error(`[${active[i].name}] crashed in update, disabling it:`, err);
        active.splice(i, 1);
      }
    }
    stage.updateCamera();
    hud.tick();
    stage.renderer.render(stage.scene, stage.camera);
  });
}

// The 🎛 button is on the live site too, so anyone can trigger every animation for testing.
// The panel code (and lil-gui) only loads on first click.
// 🚨 One-click demo: crash the office to 0.3 months of runway (night, panicking crowd),
// and press again to release back to the real numbers (which reads as a big donation: cheers, dance, shooting stars).
function addPanicButton(runway) {
  const button = document.createElement("button");
  button.className = "panic-toggle";
  button.type = "button";
  const render = () => {
    button.textContent = runway.simulating ? "🎉 Save the office!" : "🚨 Panic!";
    button.classList.toggle("active", runway.simulating);
  };
  button.addEventListener("click", async () => {
    if (runway.simulating) await runway.release();
    else runway.override({ funds: Math.round(0.3 * (runway.state.monthlyCost || 1000)), monthlyCost: runway.state.monthlyCost || 1000 });
    render();
  });
  runway.events.addEventListener("fundschange", render);
  render();
  document.body.append(button);
}

function addSimulateButton(runway, active, { open }) {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("./simulate.css", import.meta.url).href;
  document.head.append(css);

  const button = document.createElement("button");
  button.className = "sim-toggle";
  button.type = "button";
  button.textContent = "🎛 Simulate";
  button.setAttribute("aria-expanded", "false");
  document.body.append(button);

  let gui = null;
  async function toggle() {
    if (!gui) gui = (await import("./debug-panel.js")).createDebugPanel(runway, active, config);
    else gui.show(gui._hidden);
    button.setAttribute("aria-expanded", String(!gui._hidden));
  }
  button.addEventListener("click", toggle);
  if (open) toggle();
}

start();
