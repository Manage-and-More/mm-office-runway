import { MOTIONS } from '../motions.js';
import { FORMATIONS } from './formations.js';
const motions = new Set(MOTIONS.map(motion => motion.id));
const positive = value => Number.isFinite(value) && value > 0;
export function createRegistry(definitions, formations = FORMATIONS) {
  const registry = new Map();
  for (const definition of definitions) {
    if (!definition.id || registry.has(definition.id) || !definition.label || !Array.isArray(definition.phases) || !definition.phases.length) throw new Error('Invalid or duplicate group emote');
    for (const phase of definition.phases) {
      if (!['formation', 'motion', 'release'].includes(phase.type)) throw new Error('Unknown phase type');
      if (phase.type === 'formation' && (!Object.hasOwn(formations, phase.formation) || !positive(phase.timeout))) throw new Error('Invalid formation');
      if (phase.type !== 'formation' && !positive(phase.duration)) throw new Error('Invalid phase duration');
      if (phase.type === 'motion' && !motions.has(phase.motion)) throw new Error('Unknown motion');
      if (phase.speed !== undefined && !positive(phase.speed)) throw new Error('Invalid playback speed');
      if (phase.stagger !== undefined && (!Number.isFinite(phase.stagger) || phase.stagger < 0)) throw new Error('Invalid stagger');
      if (phase.facing && !['center', 'front', 'keep'].includes(phase.facing)) throw new Error('Invalid facing');
      for (const cue of phase.cues ?? []) {
        if (!Number.isFinite(cue.at) || cue.at < 0 || cue.at > (phase.duration ?? phase.timeout) || typeof cue.name !== 'string' || !cue.name) throw new Error('Invalid phase cue');
      }
    }
    if (definition.phases.at(-1).type !== 'release') throw new Error('Group emotes must end with release');
    // Own an immutable snapshot: edits by callers cannot change a running sequence.
    const copy = structuredClone(definition);
    for (const phase of copy.phases) {
      if (phase.cues) { for (const cue of phase.cues) Object.freeze(cue); Object.freeze(phase.cues); }
      Object.freeze(phase);
    }
    Object.freeze(copy.phases); registry.set(copy.id, Object.freeze(copy));
  }
  return registry;
}
