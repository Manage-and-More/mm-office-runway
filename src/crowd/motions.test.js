import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTIONS, JOINTS, createPose, sampleMotion, blendPoses } from './motions.js';
const numbers = pose => [...Object.values(pose.joints).flat(), ...pose.root, pose.mouth, pose.blink, pose.worried, pose.food];
for (const motion of MOTIONS) {
  test(`${motion.id}: complete finite poses and continuous loop seam`, () => {
    for (let frame = 0; frame <= 120; frame++) {
      const pose = sampleMotion(motion.id, frame / 120 * motion.duration);
      assert.deepEqual(Object.keys(pose.joints), JOINTS);
      assert.ok(numbers(pose).every(Number.isFinite));
      for (const channel of ['mouth', 'blink', 'worried', 'food']) assert.ok(pose[channel] >= 0 && pose[channel] <= 1);
    }
    const beginning = numbers(sampleMotion(motion.id, 0));
    const end = numbers(sampleMotion(motion.id, motion.duration - 1e-6));
    beginning.forEach((value, index) => assert.ok(Math.abs(value - end[index]) < 0.001));
    assert.notDeepEqual(numbers(sampleMotion(motion.id, 0)), numbers(sampleMotion(motion.id, motion.duration * 0.27)));
  });
}
test('sampling clears previous action channels and has no shared pose state', () => {
  const output = sampleMotion('eat', 1);
  sampleMotion('idle', 1, output);
  assert.deepEqual(output, sampleMotion('idle', 1));
  const snapshot = structuredClone(output);
  sampleMotion('panic', 0.4);
  assert.deepEqual(output, snapshot);
  assert.throws(() => sampleMotion('missing', 0), /Unknown motion/);
});
test('blending preserves exact endpoints, clamps time, and does not mutate inputs', () => {
  const from = sampleMotion('eat', 1), to = sampleMotion('panic', 0.4);
  const snapshot = structuredClone(from);
  assert.deepEqual(blendPoses(from, to, 0), from);
  assert.deepEqual(blendPoses(from, to, 1), to);
  assert.deepEqual(blendPoses(from, to, 2), to);
  const middle = blendPoses(from, to, 0.5, createPose());
  numbers(middle).forEach((value, index) => assert.ok(Math.abs(value - (numbers(from)[index] + numbers(to)[index]) / 2) < 1e-10));
  assert.deepEqual(from, snapshot);
});
