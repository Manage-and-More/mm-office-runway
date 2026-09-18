import test from "node:test";
import assert from "node:assert/strict";
import { stressFromRunway, impulseFromMonths, monthsFromDelta, moodFromStress, createFeelings } from "./feelings.js";

const curve = { midMonths: 3, width: 1.2 };

test("stress follows the S-curve: calm at long runway, panic near zero", () => {
  assert.ok(stressFromRunway(9, curve) < 0.02);
  assert.equal(stressFromRunway(3, curve), 0.5);
  assert.ok(stressFromRunway(1, curve) > 0.8);
  assert.equal(stressFromRunway(Infinity, curve), 0);
  // Monotonic: less runway never means less stress.
  for (let r = 0; r < 12; r += 0.25) assert.ok(stressFromRunway(r, curve) >= stressFromRunway(r + 0.25, curve));
});

test("a donation worth one month of costs is a full-strength impulse", () => {
  assert.equal(monthsFromDelta(7208, 7208), 1);
  assert.equal(impulseFromMonths(1), 1);
  assert.equal(impulseFromMonths(-1), -1);
  assert.equal(impulseFromMonths(50), 1);
  const small = impulseFromMonths(monthsFromDelta(200, 7208));
  assert.ok(small > 0 && small < 0.05);
  assert.equal(impulseFromMonths(0), 0);
  assert.equal(monthsFromDelta(100, 0), 0);
});

test("moods bucket the stress", () => {
  assert.equal(moodFromStress(0.01), "thriving");
  assert.equal(moodFromStress(0.2), "calm");
  assert.equal(moodFromStress(0.5), "worried");
  assert.equal(moodFromStress(0.9), "panic");
});

test("smoothed stress eases to its target and emotion decays", () => {
  const f = createFeelings({ stressSeconds: 3, emotionSeconds: 8 });
  assert.equal(f.update(0.016, 0.2).stress, 0.2); // first frame snaps
  let s;
  for (let i = 0; i < 60; i++) s = f.update(0.1, 0.9);
  assert.ok(s.stress > 0.8 && s.stress < 0.9);
  f.kick(0.7); f.kick(0.7);
  assert.equal(f.update(0, 0.9).emotion, 1); // capped
  for (let i = 0; i < 600; i++) s = f.update(0.1, 0.9);
  assert.equal(s.emotion, 0);
});
