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

const params = new URLSearchParams(location.search);
const only = params.get("only")?.split(","); // ?only=logo or ?only=crowd — work on one module in isolation
const debug = params.has("debug");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

async function start() {
  const stage = createStage(document.getElementById("scene"));
  const runway = createRunway(config);
  const hud = createHud(runway, { reducedMotion });
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
    detail: { previous: null, current: runway.state, delta: 0 },
  }));

  runway.start();
  if (debug) (await import("./debug-panel.js")).createDebugPanel(runway, active);

  const clock = new THREE.Clock();
  stage.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const frame = { dt, time: clock.elapsedTime, state: runway.state };
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

start();
