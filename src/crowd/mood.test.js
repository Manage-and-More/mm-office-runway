import test from 'node:test';
import assert from 'node:assert/strict';
import { activityWeights, chooseWeighted, stepStress, travelSpeed, reactionShare, personalThreshold } from './mood.js';
import { seededRandom, createStandardController } from './standard.js';

const share = (weights, keys) => keys.reduce((sum, k) => sum + weights[k], 0) / Object.values(weights).reduce((a, b) => a + b, 0);

test('relaxed crowds snack and dance, stressed crowds run and panic', () => {
  const calm = activityWeights(0), scared = activityWeights(0.9);
  assert.ok(share(calm, ['eat', 'dance', 'wave', 'cheer']) > 0.6);
  assert.equal(calm.panic, 0);
  assert.equal(calm.run, 0);
  assert.ok(share(scared, ['run', 'panic']) > 0.8);
  assert.equal(scared.dance, 0);
});

test('weighted choice respects the weights', () => {
  const random = seededRandom(7);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) counts[chooseWeighted({ a: 3, b: 1 }, random)]++;
  assert.ok(Math.abs(counts.a / 4000 - 0.75) < 0.03);
});

test('panic is faster than strolling and speeds up with stress', () => {
  assert.ok(travelSpeed('panic', 0.9) > travelSpeed('run', 0.9));
  assert.ok(travelSpeed('run', 0.9) > travelSpeed('run', 0));
  assert.ok(travelSpeed('walk', 0) > 0);
  assert.equal(travelSpeed('eat', 1), 0);
});

test('stress spreads from neighbours and stays in 0..1', () => {
  let alone = 0.1, crowded = 0.1;
  for (let i = 0; i < 10; i++) {
    alone = stepStress(alone, 0.1, null, 0.1);
    crowded = stepStress(crowded, 0.1, 0.9, 0.1);
  }
  assert.ok(crowded > alone + 0.2, 'panicking neighbours raise stress');
  assert.equal(stepStress(0.99, 1.5, 1, 5), 1);
  assert.equal(stepStress(0.01, -1, 0, 5), 0);
});

test('reactions: small donations reach a few, big ones everyone', () => {
  assert.ok(reactionShare(0.02) < 0.2);
  assert.equal(reactionShare(1), 1);
  const random = seededRandom(3);
  const t = Array.from({ length: 2000 }, () => personalThreshold(random));
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  assert.ok(Math.abs(mean) < 0.01 && Math.max(...t) <= 0.3 && Math.min(...t) >= -0.3);
});

test('controllers follow stress: calm → activities, panic → running', () => {
  const run = s => {
    const counts = {};
    for (let i = 0; i < 30; i++) {
      const c = createStandardController({ seed: i * 101 + 7, stress: () => s });
      for (let f = 0; f < 600; f++) { c.update(0.1); counts[c.action] = (counts[c.action] ?? 0) + 1; }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return k => (counts[k] ?? 0) / total;
  };
  const calm = run(0), scared = run(0.95);
  assert.ok(calm('run') + calm('panic') === 0);
  assert.ok(calm('dance') > 0);
  assert.ok(scared('run') + scared('panic') > 0.5, 'panicked crowd is mostly running');
  const reacting = createStandardController({ seed: 1, stress: () => 0 });
  reacting.react('cheer', 2);
  assert.equal(reacting.action, 'cheer');
});

test('panicking residents dash further but keep logo space, bounds and personal space', async () => {
  const { createWanderer, updateWanderer } = await import('./wander.js');
  const { createLobbyLayout } = await import('./layout.js');
  const { CROWD_INNER_RADIUS, CROWD_OUTER_RADIUS } = await import('../contracts/module.js');
  const simulate = stress => {
    const residents = createLobbyLayout(40).map((position, i) => {
      const resident = { stress, mii: { position: { x: position.x, z: position.z }, rotation: { y: position.heading } }, wanderer: createWanderer(i * 911 + 31, position) };
      resident.controller = createStandardController({ seed: i * 3917 + 59, stress: () => resident.stress });
      return resident;
    });
    let travelled = 0;
    for (let frame = 0; frame < 1200; frame++) {
      for (const r of residents) {
        const { x, z } = r.mii.position;
        r.controller.update(0.1);
        updateWanderer(r, residents, 0.1);
        const p = r.mii.position;
        travelled += Math.hypot(x - p.x, z - p.z);
        assert.ok(Math.hypot(p.x, p.z) >= CROWD_INNER_RADIUS + 0.39);
        assert.ok(Math.hypot(p.x, p.z) <= CROWD_OUTER_RADIUS - 0.39);
      }
      if (frame % 20 === 0) for (let i = 0; i < residents.length; i++) for (let j = 0; j < i; j++) {
        const a = residents[i].mii.position, b = residents[j].mii.position;
        assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 0.77);
      }
    }
    return travelled;
  };
  const calm = simulate(0), scared = simulate(0.95);
  assert.ok(scared > calm * 3, `panic should move a lot more: calm ${calm.toFixed(0)}, scared ${scared.toFixed(0)}`);
});
