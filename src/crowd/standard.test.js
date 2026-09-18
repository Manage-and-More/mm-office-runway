import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandardController, STANDARD_ACTIONS } from './standard.js';
import { createLobbyLayout, createDemoSpec } from './layout.js';
import { CROWD_INNER_RADIUS, CROWD_OUTER_RADIUS } from '../contracts/module.js';

test('40 residents independently cycle through all standard activities', () => {
  const controllers = Array.from({ length: 40 }, (_, i) => createStandardController({ seed: i * 3917 + 59 }));
  const observed = new Set();
  let mixedFrames = 0;
  let idleSamples = 0;
  for (let frame = 0; frame < 3000; frame++) {
    const actions = new Set();
    for (const controller of controllers) {
      controller.update(0.1);
      observed.add(controller.action); actions.add(controller.action);
      assert.ok(STANDARD_ACTIONS.includes(controller.action));
      if (controller.action === 'idle') idleSamples++;
      assert.ok(controller.pose.root.every(Number.isFinite));
    }
    if (actions.size > 1) mixedFrames++;
  }
  assert.deepEqual([...observed].sort(), [...STANDARD_ACTIONS].sort());
  assert.ok(mixedFrames > 2900, 'crowd should not synchronize');
  assert.ok(idleSamples / (3000 * 40) > 0.65, 'standard should remain mostly idle');
});
test('reduced-motion residents stay in gentle idle', () => {
  const controller = createStandardController({ seed: 3, reducedMotion: true });
  for (let i = 0; i < 4000; i++) { controller.update(0.1); assert.equal(controller.action, 'idle'); }
});
test('same seed and timing reproduce the same behavior', () => {
  const a = createStandardController({ seed: 29 }), b = createStandardController({ seed: 29 });
  for (let i = 0; i < 500; i++) { a.update(0.1); b.update(0.1); }
  assert.equal(a.action, b.action); assert.deepEqual(a.pose, b.pose);
});
test('layout protects logo space, lobby bounds, and personal space up to 150 Miis', () => {
  for (const count of [40, 150]) {
    const positions = createLobbyLayout(count);
    assert.equal(positions.length, count);
    for (let i = 0; i < count; i++) {
      const { x, z } = positions[i];
      const radius = Math.hypot(x, z);
      assert.ok(radius >= CROWD_INNER_RADIUS + 0.45);
      assert.ok(radius <= CROWD_OUTER_RADIUS - 0.45);
      for (let j = 0; j < i; j++) assert.ok(Math.hypot(x - positions[j].x, z - positions[j].z) > 0.98);
    }
  }
});
test('fictional fillers are deterministic and do not invent donor consent', () => {
  const first = createDemoSpec(0);
  assert.deepEqual(first, createDemoSpec(0));
  assert.notDeepEqual(first, createDemoSpec(1));
  assert.equal(first.consent, undefined);
  assert.equal(first.displayName, undefined);
});

test('strolls move residents without crossing logo space or each other', async () => {
  const { createWanderer, updateWanderer } = await import('./wander.js');
  const positions = createLobbyLayout(40);
  const residents = positions.map((position, i) => ({
    mii: { position: { x: position.x, z: position.z }, rotation: { y: position.heading } },
    controller: createStandardController({ seed: i * 3917 + 59 }),
    wanderer: createWanderer(i * 911 + 31, position),
  }));
  let travelled = 0;
  for (let frame = 0; frame < 2400; frame++) {
    for (const resident of residents) {
      const { x, z } = resident.mii.position;
      resident.controller.update(0.1);
      updateWanderer(resident, residents, 0.1);
      const p = resident.mii.position;
      travelled += Math.hypot(x - p.x, z - p.z);
      assert.ok(Math.hypot(p.x, p.z) >= CROWD_INNER_RADIUS + 0.39);
      assert.ok(Math.hypot(p.x, p.z) <= CROWD_OUTER_RADIUS - 0.39);
    }
    if (frame % 20 === 0) for (let i = 0; i < residents.length; i++) for (let j = 0; j < i; j++) {
      const a = residents[i].mii.position, b = residents[j].mii.position;
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 0.77);
    }
  }
  assert.ok(travelled > 25, `expected visible wandering, got ${travelled}`);
});
