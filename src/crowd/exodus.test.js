import test from 'node:test';
import assert from 'node:assert/strict';
import { createExodus, EXIT_RADIUS, leaveShare } from './exodus.js';
import { createStandardController, seededRandom } from './standard.js';
import { createLobbyLayout } from './layout.js';

function crowd() {
  return createLobbyLayout(40).map((p, i) => {
    const r = { mii: { position: { x: p.x, z: p.z }, rotation: { y: 0 }, visible: true }, wanderer: { walking: false }, reaction: null, away: null, stress: 0 };
    r.controller = createStandardController({ seed: i, stress: () => r.stress });
    return r;
  });
}

test('at full panic most Miis pack up, walk off the island and vanish; a donation brings them running back', () => {
  const residents = crowd();
  const boxes = new Set();
  const exodus = createExodus({ residents, random: seededRandom(5), setBox: (r, on) => on ? boxes.add(r) : boxes.delete(r) });
  for (let f = 0; f < 60 * 60; f++) { exodus.update(1 / 60, 1); for (const r of residents) r.controller.update(1 / 60); }
  const gone = residents.filter(r => r.away?.phase === 'gone');
  assert.ok(gone.length >= 20, `expected many gone, got ${gone.length} (away ${exodus.awayCount})`);
  for (const r of gone) {
    assert.equal(r.mii.visible, false);
    assert.ok(Math.hypot(r.mii.position.x, r.mii.position.z) > EXIT_RADIUS - 0.2);
  }
  assert.ok(boxes.size > 0);

  exodus.recall();
  for (let f = 0; f < 60 * 15; f++) { exodus.update(1 / 60, 0.1); for (const r of residents) r.controller.update(1 / 60); }
  assert.equal(exodus.awayCount, 0);
  assert.equal(boxes.size, 0);
  for (const r of residents) assert.equal(r.mii.visible, true);
});

test('hysteresis: nobody leaves at moderate stress, and leaving stops below the return threshold', () => {
  const residents = crowd();
  const exodus = createExodus({ residents, random: seededRandom(9) });
  for (let f = 0; f < 600; f++) exodus.update(0.1, 0.7);
  assert.equal(exodus.awayCount, 0);
  assert.equal(leaveShare(0.5), 0);
  assert.ok(leaveShare(1) > 0.7);
});
