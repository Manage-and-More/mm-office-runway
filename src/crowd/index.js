import { createGroupDirector } from './group-emotes/director.js';
import { buildMii } from './mii.js';
import { createStandardController } from './standard.js';
import { createLobbyLayout, createDemoSpec } from './layout.js';
import { createCrowdBatches } from './batches.js';
import { createWanderer, updateWanderer } from './wander.js';

export const DEFAULT_CROWD_SIZE = 40;

/** @type {import('../contracts/module.js').CreateModule} */
export default function createCrowd({ root, avatars = [], reducedMotion, navigation }) {
  // Standard remains the default. Special occasions are explicitly triggered through groupEmotes.
  const options = { people: DEFAULT_CROWD_SIZE, paused: false };
  const stats = { state: 'standard', idle: 0, walk: 0, eat: 0, wave: 0, cheer: 0 };
  const consented = avatars.filter(spec => spec?.consent?.public === true);
  let residents = [], batches, director;
  const listeners = new Set();
  const groupEmotes = {
    play: (id, options) => director.play(id, options),
    cancel: () => director.cancel(),
    list: () => director.list(),
    getStatus: () => ({ ...director.status, active: director.active }),
    subscribe(listener) { if (typeof listener !== 'function') throw new TypeError('Expected listener'); listeners.add(listener); return () => listeners.delete(listener); },
  };
  root.userData.groupEmotes = groupEmotes;
  function rebuild() {
    director?.dispose();
    batches?.dispose();
    const positions = createLobbyLayout(options.people, 42, navigation);
    residents = positions.map((position, index) => {
      const mii = buildMii(consented[index] ?? createDemoSpec(index));
      mii.position.set(position.x, 0, position.z);
      mii.rotation.y = position.heading;
      const controller = createStandardController({ seed: index * 3917 + 59, reducedMotion });
      mii.userData.applyPose(controller.pose);
      return { mii, controller, wanderer: createWanderer(index * 911 + 31, position) };
    });
    director = createGroupDirector(residents, { reducedMotion, navigation, onEvent(event) {
      for (const listener of listeners) { try { listener(event); } catch (error) { console.error('Group emote listener:', error); } }
    } });
    batches = createCrowdBatches(root, residents.map(resident => resident.mii));
    batches.update();
    root.userData.crowdSize = residents.length;
    root.userData.demoCount = Math.max(0, residents.length - consented.length);
    root.userData.state = 'standard';
  }
  rebuild();
  return {
    groupEmotes,
    update({ dt }) {
      if (options.paused) return;
      if (director.update(dt)) {
        stats.state = root.userData.state = director.active ? director.status.emote : 'standard';
        batches.update(); return;
      }
      stats.state = root.userData.state = 'standard';
      stats.idle = stats.walk = stats.eat = stats.wave = stats.cheer = 0;
      for (const resident of residents) {
        resident.controller.update(dt);
        updateWanderer(resident, residents, dt, navigation);
        resident.mii.userData.applyPose(resident.controller.pose);
        stats[resident.controller.action]++;
      }
      batches.update();
    },
    debugUI(gui) {
      gui.add(options, 'people', 8, 150, 1).name('Miis').onFinishChange(rebuild);
      gui.add(options, 'paused').name('Pause crowd');
      gui.add(stats, 'state').name('Crowd state').listen().disable();
      const emote = { selection: 'garden-dance', phase: '', result: '', play() { groupEmotes.play(this.selection, { busy: 'replace' }); }, queue() { groupEmotes.play(this.selection, { busy: 'queue' }); }, cancel() { groupEmotes.cancel(); } };
      const folder = gui.addFolder('Group emotes');
      folder.add(emote, 'selection', Object.fromEntries(groupEmotes.list().map(item => [item.label, item.id]))).name('Occasion');
      folder.add(emote, 'play').name('Play / replace');
      folder.add(emote, 'queue').name('Queue next');
      folder.add(emote, 'cancel').name('Cancel');
      Object.defineProperty(emote, 'phase', { get: () => director.status.phase });
      Object.defineProperty(emote, 'result', { get: () => director.status.lastResult });
      folder.add(emote, 'phase').listen().disable();
      folder.add(emote, 'result').listen().disable();
      for (const action of ['idle', 'walk', 'eat', 'wave', 'cheer']) gui.add(stats, action).listen().disable();
    },
    dispose() {
      director.dispose();
      listeners.clear();
      delete root.userData.groupEmotes;
      batches.dispose();
      residents = [];
    },
  };
}
