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
import { createMemberBar } from "./member.js";
import { createPeople } from "./people.js";

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
  const [avatars] = await Promise.all([loadAvatars(config.avatarIndexUrl, config), runway.refresh()]);

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
  // Name tags over donors' Miis (signed-in members only) and the member bar: sign in, add a payment
  // (re-reads the runway at once so the crowd cheers), open the Mii editor.
  const crowdRoot = stage.scene.getObjectByName("crowd");
  const people = createPeople({
    camera: stage.camera,
    miis: () => crowdRoot?.userData.miis?.() ?? [],
    // Click your own Mii: a little celebration. Click someone else's: they wave back.
    onPick: (id, info) => {
      const party = ["dance", "cheer"][Math.floor(Math.random() * 2)];
      const emoji = info?.mine ? ["🎉", "🥳", "💃", "🙌"][Math.floor(Math.random() * 4)] : "👋";
      crowdRoot?.userData.react?.(id, info?.mine ? party : "wave", reducedMotion ? null : emoji);
    },
  });
  createMemberBar(config, { onPaymentAdded: () => runway.release(), people });
  for (const button of document.querySelectorAll(".nav [data-nav]")) {
    button.addEventListener("click", () => {
      const n = stage.navigation;
      ({ left: () => n.rotate(-Math.PI / 8), right: () => n.rotate(Math.PI / 8), in: () => n.zoom(0.8), out: () => n.zoom(1.25), reset: () => n.reset() })[button.dataset.nav]();
    });
  }
  if (debug) addSimulatePanel(runway, active);

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
    people.update();
    hud.tick();
    stage.renderer.render(stage.scene, stage.camera);
  });
}

// The Simulate panel (lil-gui) is for development: `?debug` opens it. No button on the page.
function addSimulatePanel(runway, active) {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("./simulate.css", import.meta.url).href;
  document.head.append(css);
  import("./debug-panel.js").then(({ createDebugPanel }) => createDebugPanel(runway, active, config));
}

start();
