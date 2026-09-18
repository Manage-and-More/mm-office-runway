import { createPose, sampleMotion, blendPoses } from '../motions.js';
import { GROUP_EMOTES } from './definitions.js';
import { FORMATIONS, assignSlots } from './formations.js';
import { createRegistry } from './registry.js';
import { moveToSlot, turnToward } from './navigation.js';

/** Independent of Three.js; residents provide position/rotation and a pose controller. */
export function createGroupDirector(residents, { reducedMotion = false, navigation, definitions = GROUP_EMOTES, formations = FORMATIONS, onEvent = () => {} } = {}) {
  const registry = createRegistry(definitions, formations);
  const actors = residents.map(resident => ({ resident, pose: createPose(), from: createPose(), targetPose: createPose(), idlePose: createPose(), target: null, route: null, waypoint: 0 }));
  const queue = [];
  const status = { emote: '', phase: 'standard', progress: 0, queued: 0, lastResult: '' };
  let active = null, phaseIndex = -1, elapsed = 0, duration = 0, cueSent = new Set(), disposed = false, revision = 0;
  const emit = (type, extra = {}) => {
    try { onEvent({ type, id: active?.id ?? '', phase: phaseIndex, ...extra }); }
    catch (error) { console.error('Group-emote event handler failed:', error); }
  };
  function finish(result) {
    for (const actor of actors) {
      actor.resident.controller.resumeFromPose(actor.pose);
      actor.resident.wanderer.walking = false;
    }
    const id = active?.id ?? '';
    revision++;
    active = null; status.emote = ''; status.phase = 'standard'; status.progress = 0;
    status.lastResult = result; emit('finish', { id, result });
  }
  function enterPhase() {
    phaseIndex++;
    if (phaseIndex >= active.phases.length) { finish('completed'); return; }
    const phase = active.phases[phaseIndex];
    elapsed = 0; cueSent = new Set();
    status.phase = phase.type; status.progress = 0;
    duration = (phase.duration ?? phase.timeout) + (phase.type === 'motion' ? (phase.stagger ?? 0) * Math.max(0, actors.length - 1) : 0);
    for (const actor of actors) blendPoses(actor.pose, actor.pose, 1, actor.from);
    if (phase.type === 'formation' && !reducedMotion) {
      const slots = formations[phase.formation](actors.length);
      const targets = assignSlots(residents.map(resident => resident.mii.position), slots);
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i]; actor.target = targets[i]; actor.waypoint = 0;
        actor.route = navigation?.findPath(actor.resident.mii.position, actor.target) ?? null;
        if (navigation && !actor.route) { finish('unreachable-formation'); return; }
      }
    }
    emit('phase');
  }
  function start(id) {
    active = registry.get(id); phaseIndex = -1;
    for (const actor of actors) blendPoses(actor.resident.controller.pose, actor.resident.controller.pose, 1, actor.pose);
    const started = ++revision;
    status.emote = id; emit('start');
    if (revision === started && active) enterPhase();
  }
  return {
    status,
    list: () => [...registry.values()].map(({ id, label }) => ({ id, label })),
    get active() { return active !== null; },
    play(id, { busy = 'reject' } = {}) {
      if (disposed || !registry.has(id) || !actors.length || !['reject', 'queue', 'replace'].includes(busy)) return false;
      if (active) {
        if (busy === 'reject') return false;
        if (busy === 'queue') {
          if (queue.length >= 4) return false;
          queue.push(id); status.queued = queue.length; return true;
        }
        queue.length = 0; status.queued = 0; finish('replaced');
      }
      start(id); return true;
    },
    cancel() { queue.length = 0; status.queued = 0; if (active) finish('cancelled'); },
    update(dt) {
      if (disposed) return false;
      if (!active && queue.length) { const next = queue.shift(); status.queued = queue.length; start(next); }
      if (!active) return false;
      const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
      const phase = active.phases[phaseIndex], updating = revision;
      elapsed += step;
      let arrived = true;
      for (let i = 0; i < actors.length; i++) {
        const actor = actors[i];
        let motion = phase.motion ?? 'idle', clock = elapsed * (phase.speed ?? 1), participation = 1;
        if (phase.type === 'formation' && !reducedMotion) {
          const done = moveToSlot(actor, actors, step, navigation);
          arrived = arrived && done; motion = done ? 'idle' : 'walk'; clock = elapsed * 1.8;
        } else if (phase.type === 'motion') {
          const local = elapsed - (phase.stagger ?? 0) * i;
          participation = Math.max(0, Math.min(1, local / 0.3, (phase.duration - local) / 0.3));
          if (local < 0 || local >= phase.duration) motion = 'idle';
          clock = Math.max(0, local) * (phase.speed ?? 1);
          if (!reducedMotion && phase.facing && phase.facing !== 'keep') {
            const p = actor.resident.mii.position;
            turnToward(actor.resident.mii, phase.facing === 'front' ? 0 : Math.atan2(-p.x, -p.z), step);
          }
        }
        if (reducedMotion) { motion = 'idle'; clock = elapsed * 0.3; }
        sampleMotion(motion, clock, actor.targetPose);
        if (phase.type === 'motion' && !reducedMotion) {
          sampleMotion('idle', elapsed * 0.3, actor.idlePose);
          blendPoses(actor.idlePose, actor.targetPose, participation, actor.targetPose);
        }
        blendPoses(actor.from, actor.targetPose, Math.min(1, elapsed / 0.45), actor.pose);
        actor.resident.mii.userData.applyPose(actor.pose);
      }
      for (let i = 0; i < (phase.cues?.length ?? 0); i++) {
        const cue = phase.cues[i];
        if (elapsed >= cue.at && !cueSent.has(i)) {
          cueSent.add(i);
          if (!reducedMotion) emit('cue', { name: cue.name });
          if (updating !== revision) return true;
        }
      }
      status.progress = Math.min(1, elapsed / duration);
      if (phase.type === 'formation') {
        if (reducedMotion || arrived) enterPhase();
        else if (elapsed >= duration) finish('formation-timeout');
      } else if (elapsed >= duration) enterPhase();
      return true;
    },
    dispose() { disposed = true; this.cancel(); },
  };
}
