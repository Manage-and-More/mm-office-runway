import { CROWD_INNER_RADIUS, CROWD_OUTER_RADIUS } from '../contracts/module.js';
import { seededRandom } from './standard.js';

// A staggered hex grid keeps characters separate while preserving logo space.
export function createLobbyLayout(count, seed = 42, navigation) {
  const random = seededRandom(seed);
  const slots = [];
  const spacing = 1.14;
  const edge = Math.ceil(CROWD_OUTER_RADIUS / spacing);
  for (let row = -edge; row <= edge; row++) for (let col = -edge; col <= edge; col++) {
    const x = (col + (Math.abs(row) % 2) * 0.5) * spacing;
    const z = row * spacing * Math.sqrt(3) / 2;
    const radius = Math.hypot(x, z);
    if ((navigation ? navigation.isWalkable(x, z) : radius > CROWD_INNER_RADIUS + 0.55) && radius < CROWD_OUTER_RADIUS - 0.55) slots.push({ x, z });
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const available = [];
  for (const slot of slots) {
    if (!navigation || navigation.findPath({ x: 8, z: 0 }, slot)) available.push(slot);
    if (available.length === count) break;
  }
  return available.slice(0, count).map(slot => ({
    x: slot.x + (navigation ? 0 : (random() - 0.5) * 0.10),
    z: slot.z + (navigation ? 0 : (random() - 0.5) * 0.10),
    heading: (random() - 0.5) * Math.PI * 1.35,
  }));
}

const shirts = ['#69d6b1', '#e8ab50', '#df7975', '#608dc9', '#9b83c7', '#4fa0a0', '#ece5d7', '#535b72'];
const skins = ['#f1be94', '#e6ad83', '#bf855c', '#8a573b', '#613f30', '#f3d6bc'];
const hairColors = ['#342822', '#6b3e26', '#c29b58', '#24252b', '#a4a2a0'];
const hairStyles = ['sidepart', 'short', 'bun', 'curly', 'long', 'none', 'ponytail', 'buzz'];

// Fictional filler characters, created at runtime. Never donor records, and no
// invented consent entries or personal data are written to data/avatars/.
export function createDemoSpec(index) {
  const random = seededRandom(index * 947 + 13);
  const pick = list => list[Math.floor(random() * list.length)];
  return {
    id: `demo-${index}`,
    shirtColor: pick(shirts),
    head: { skinTone: pick(skins), shape: pick(['round', 'oval', 'long', 'square']) },
    hair: { style: pick(hairStyles), color: pick(hairColors) },
    eyes: { color: '#252c32', style: 'round' },
    glasses: random() < 0.2 ? 'round' : 'none',
    height: 0.88 + random() * 0.24,
  };
}
