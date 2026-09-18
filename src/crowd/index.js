import { createGroupDirector } from './group-emotes/director.js';
import { buildMii } from './mii.js';
import { createStandardController, seededRandom } from './standard.js';
import { createLobbyLayout, createDemoSpec } from './layout.js';
import { createCrowdBatches } from './batches.js';
import { createWanderer, updateWanderer } from './wander.js';
import { personalThreshold, stepStress, WAVE_SPEED, reactionShare } from './mood.js';
import { createExodus } from './exodus.js';
import { createBubbles, PANIC_WORDS, HAPPY_WORDS, PARTY_WORDS } from './bubbles.js';
import * as THREE from 'three';

const BOX_GEOMETRY = new THREE.BoxGeometry(0.62, 0.5, 0.5);
const BOX_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xc9995a, roughness: 0.95 });
// A cardboard box held in front of the chest (in the avatar's 2.7-unit rig space), hidden until moving day.
function attachBox(mii) {
  const box = new THREE.Mesh(BOX_GEOMETRY, BOX_MATERIAL);
  box.position.set(0, 0.28, 0.5);
  box.visible = false;
  box.castShadow = true;
  (mii.userData.joints?.spine ?? mii).add(box);
  mii.userData.box = box;
}

export const DEFAULT_CROWD_SIZE = 40;
const NEIGHBOUR_RADIUS = 2.5;
const ACTIONS = ['idle', 'walk', 'eat', 'wave', 'cheer', 'dance', 'run', 'panic'];
/** A donation this big (impulse ≥, i.e. ≥ ~0.7 months of runway) gets the full "Gather & dance". */
const PARTY_IMPULSE = 0.8;

/** @type {import('../contracts/module.js').CreateModule} */
export default function createCrowd({ root, avatars = [], events, reducedMotion, navigation, camera }) {
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = new URL('./crowd.css', import.meta.url).href;
  document.head.append(css);
  const bubbles = createBubbles({ camera, reducedMotion });
  let exodus, bubbleTimer = 0;
  // Behaviour follows frame.feelings (equations in mood.js):
  //   crowd stress → each resident's own stress (personal threshold + contagion from neighbours)
  //   → activity weights, tempo, speed, hangouts vs scattering, worried faces.
  // Money moving (fundschange.impulse) ripples out from the centre as cheers or flinches;
  // a big donation plays the "garden-dance" group emote. Group emotes can still be triggered by hand.
  const options = { people: DEFAULT_CROWD_SIZE, paused: false, contagion: 1.5 };
  const stats = Object.fromEntries([['state', 'mood'], ['stress', '0.00'], ['away', 0], ...ACTIONS.map(a => [a, 0])]);
  const consented = avatars.filter(spec => spec?.consent?.public === true);
  const random = seededRandom(20260918);
  let residents = [], batches, director, now = 0, crowdStress = 0;
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
      attachBox(mii);
      mii.position.set(position.x, 0, position.z);
      mii.rotation.y = position.heading;
      const resident = {
        mii,
        stress: crowdStress,
        threshold: personalThreshold(seededRandom(index * 7919 + 17)),
        reaction: null,
        away: null,
        wanderer: createWanderer(index * 911 + 31, position),
      };
      resident.controller = createStandardController({ seed: index * 3917 + 59, reducedMotion, stress: () => resident.stress });
      mii.userData.applyPose(resident.controller.pose);
      return resident;
    });
    director = createGroupDirector(residents, { reducedMotion, navigation, onEvent(event) {
      for (const listener of listeners) { try { listener(event); } catch (error) { console.error('Group emote listener:', error); } }
    } });
    batches = createCrowdBatches(root, residents.map(resident => resident.mii));
    batches.update();
    exodus = createExodus({ residents, random, reducedMotion, setBox: (r, on) => { r.mii.userData.box.visible = on; } });
    root.userData.crowdSize = residents.length;
    root.userData.demoCount = Math.max(0, residents.length - consented.length);
    root.userData.state = 'mood';
  }
  rebuild();

  events.addEventListener('fundschange', ({ detail: { impulse } }) => {
    if (!impulse || reducedMotion) return;
    if (impulse > 0) exodus.recall(); // everyone comes home for a donation
    const words = impulse > 0 ? PARTY_WORDS : PANIC_WORDS;
    for (const r of residents) if (r.mii.visible && random() < Math.abs(impulse) * 0.5) bubbles.show(r, words[Math.floor(random() * words.length)], 2.5);
    if (impulse >= PARTY_IMPULSE && director.play('garden-dance', { busy: 'replace' })) return;
    // The reaction wave: residents closer to the centre react first.
    const share = reactionShare(impulse);
    for (const resident of residents) {
      if (resident.away || random() > share) continue;
      const distance = Math.hypot(resident.mii.position.x, resident.mii.position.z);
      resident.reaction = {
        at: now + distance / WAVE_SPEED + random() * 0.2,
        action: impulse > 0 ? (impulse > 0.5 && random() < 0.4 ? 'dance' : 'cheer') : 'panic',
        cycles: impulse > 0 ? 1 + Math.round(Math.abs(impulse) * 2) : 1,
      };
    }
  });

  const neighbourStress = [];
  function updateStress(dt, emotion) {
    // Contagion uses last frame's values so the update order doesn't matter.
    for (let i = 0; i < residents.length; i++) {
      const a = residents[i].mii.position;
      let sum = 0, n = 0;
      for (let j = 0; j < residents.length; j++) {
        if (i === j) continue;
        const b = residents[j].mii.position;
        if (Math.abs(a.x - b.x) < NEIGHBOUR_RADIUS && Math.abs(a.z - b.z) < NEIGHBOUR_RADIUS && Math.hypot(a.x - b.x, a.z - b.z) < NEIGHBOUR_RADIUS) {
          sum += residents[j].stress; n++;
        }
      }
      neighbourStress[i] = n ? sum / n : null;
    }
    let total = 0;
    for (let i = 0; i < residents.length; i++) {
      const resident = residents[i];
      // Joy relieves a little stress for a while; shock adds some.
      const target = crowdStress + resident.threshold - 0.35 * emotion;
      resident.stress = stepStress(resident.stress, target, neighbourStress[i], dt, { alpha: options.contagion });
      total += resident.stress;
    }
    stats.stress = (residents.length ? total / residents.length : 0).toFixed(2);
  }

  return {
    groupEmotes,
    update({ dt, state, feelings }) {
      now += dt;
      crowdStress = feelings?.stress ?? state.stress ?? 0;
      if (options.paused) return;
      updateStress(dt, feelings?.emotion ?? 0);
      bubbles.update(dt);
      // Ambient chatter: scared Miis yelp, happy ones hum.
      bubbleTimer -= dt;
      if (bubbleTimer <= 0 && !reducedMotion) {
        const scared = crowdStress > 0.55, happy = crowdStress < 0.15;
        bubbleTimer = scared ? 1.5 - crowdStress : happy ? 2.5 : 1;
        if (scared || happy) {
          const visible = residents.filter(r => r.mii.visible && !r.away);
          const r = visible[Math.floor(random() * visible.length)];
          const words = scared ? PANIC_WORDS : HAPPY_WORDS;
          if (r) bubbles.show(r, words[Math.floor(random() * words.length)]);
        }
      }
      if (director.update(dt)) {
        stats.state = root.userData.state = director.active ? director.status.emote : 'mood';
        batches.update(); return;
      }
      stats.state = root.userData.state = 'mood';
      for (const action of ACTIONS) stats[action] = 0;
      for (const resident of residents) {
        if (resident.reaction && now >= resident.reaction.at) {
          resident.controller.react(resident.reaction.action, resident.reaction.cycles);
          resident.wanderer.walking = false;
          resident.reaction = null;
        }
        resident.controller.update(dt);
        if (!resident.away) updateWanderer(resident, residents, dt, navigation);
        const pose = resident.controller.pose;
        pose.worried = Math.max(pose.worried, resident.stress ** 1.5);
        resident.mii.userData.applyPose(pose);
        stats[resident.controller.action]++;
      }
      exodus.update(dt, crowdStress);
      stats.away = exodus.awayCount;
      batches.update();
    },
    debugUI(gui) {
      gui.add(options, 'people', 8, 150, 1).name('Miis').onFinishChange(rebuild);
      gui.add(options, 'paused').name('Pause crowd');
      gui.add(options, 'contagion', 0, 4, 0.1).name('panic contagion');
      gui.add(stats, 'state').name('Crowd state').listen().disable();
      gui.add(stats, 'stress').name('avg Mii stress').listen().disable();
      gui.add(stats, 'away').name('moved out').listen().disable();
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
      for (const action of ACTIONS) gui.add(stats, action).listen().disable();
    },
    dispose() {
      bubbles.dispose();
      css.remove();
      director.dispose();
      listeners.clear();
      delete root.userData.groupEmotes;
      batches.dispose();
      residents = [];
    },
  };
}
