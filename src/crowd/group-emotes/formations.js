import { GARDEN_RADIUS, CROWD_OUTER_RADIUS } from '../../contracts/module.js';

export const FORMATIONS = {
  'garden-rings'(count) {
    const slots = [];
    for (let radius = GARDEN_RADIUS + 0.6; slots.length < count && radius <= CROWD_OUTER_RADIUS - 0.5; radius += 1.15) {
      const capacity = Math.floor(2 * Math.PI * radius / 1.15);
      const ringCount = Math.min(capacity, count - slots.length);
      for (let i = 0; i < ringCount; i++) {
        const angle = i / ringCount * Math.PI * 2;
        slots.push({ x: Math.sin(angle) * radius, z: Math.cos(angle) * radius });
      }
    }
    if (slots.length < count) throw new Error('Formation exceeds available lobby space');
    return slots;
  },
};

export function assignSlots(positions, slots) {
  // Minimum-cost bipartite assignment avoids long crossing routes left by greedy matching.
  const n = positions.length, m = slots.length;
  if (m < n) throw new Error('Not enough formation slots');
  const u = new Float64Array(n + 1), v = new Float64Array(m + 1);
  const matched = new Int32Array(m + 1), previous = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    matched[0] = i;
    let column = 0;
    const min = new Float64Array(m + 1).fill(Infinity), used = new Uint8Array(m + 1);
    do {
      used[column] = 1;
      const row = matched[column];
      let delta = Infinity, next = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cost = (positions[row-1].x-slots[j-1].x)**2 + (positions[row-1].z-slots[j-1].z)**2 - u[row] - v[j];
        if (cost < min[j]) { min[j] = cost; previous[j] = column; }
        if (min[j] < delta) { delta = min[j]; next = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[matched[j]] += delta; v[j] -= delta; }
        else min[j] -= delta;
      }
      column = next;
    } while (matched[column] !== 0);
    do { const before = previous[column]; matched[column] = matched[before]; column = before; } while (column !== 0);
  }
  const result = new Array(n);
  for (let j = 1; j <= m; j++) if (matched[j]) result[matched[j]-1] = slots[j-1];
  return result;
}
