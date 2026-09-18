import { buildMii } from './mii.js';
import { createStandardController } from './standard.js';
import { createLobbyLayout, createDemoSpec } from './layout.js';
import { createCrowdBatches } from './batches.js';
import { createWanderer, updateWanderer } from './wander.js';

export const DEFAULT_CROWD_SIZE = 40;

/** @type {import('../contracts/module.js').CreateModule} */
export default function createCrowd({ root, avatars = [], reducedMotion }) {
  // Only standard is implemented. Funds moods and donation events intentionally
  // do not trigger panic/celebration yet. Those will get separate controllers.
  const options = { people: DEFAULT_CROWD_SIZE, paused: false };
  const stats = { state: 'standard', idle: 0, walk: 0, eat: 0, wave: 0, cheer: 0 };
  const consented = avatars.filter(spec => spec?.consent?.public === true);
  let residents = [], batches;
  function rebuild() {
    batches?.dispose();
    const positions = createLobbyLayout(options.people);
    residents = positions.map((position, index) => {
      const mii = buildMii(consented[index] ?? createDemoSpec(index));
      mii.position.set(position.x, 0, position.z);
      mii.rotation.y = position.heading;
      const controller = createStandardController({ seed: index * 3917 + 59, reducedMotion });
      mii.userData.applyPose(controller.pose);
      return { mii, controller, wanderer: createWanderer(index * 911 + 31, position) };
    });
    batches = createCrowdBatches(root, residents.map(resident => resident.mii));
    batches.update();
    root.userData.crowdSize = residents.length;
    root.userData.demoCount = Math.max(0, residents.length - consented.length);
    root.userData.state = 'standard';
  }
  rebuild();
  return {
    update({ dt }) {
      if (options.paused) return;
      stats.idle = stats.walk = stats.eat = stats.wave = stats.cheer = 0;
      for (const resident of residents) {
        resident.controller.update(dt);
        updateWanderer(resident, residents, dt);
        resident.mii.userData.applyPose(resident.controller.pose);
        stats[resident.controller.action]++;
      }
      batches.update();
    },
    debugUI(gui) {
      gui.add(options, 'people', 8, 150, 1).name('Miis').onFinishChange(rebuild);
      gui.add(options, 'paused').name('Pause crowd');
      gui.add(stats, 'state').name('Crowd state').disable();
      for (const action of ['idle', 'walk', 'eat', 'wave', 'cheer']) gui.add(stats, action).listen().disable();
    },
    dispose() {
      batches.dispose();
      residents = [];
    },
  };
}
