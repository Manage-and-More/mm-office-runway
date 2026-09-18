// PLACEHOLDER crowd — the crowd workstream replaces this.
// Shows the contract: calm wandering when funds are healthy, frantic running when in panic.
import * as THREE from "three";
import { CROWD_INNER_RADIUS, CROWD_OUTER_RADIUS } from "../contracts/module.js";
import { buildMii } from "./mii.js";

const SPEED = { thriving: 0.5, calm: 0.8, worried: 1.8, panic: 4 };
const RETARGET = { thriving: 6, calm: 5, worried: 2, panic: 0.7 }; // seconds between new destinations

function randomSpot() {
  const a = Math.random() * Math.PI * 2;
  const r = CROWD_INNER_RADIUS + Math.random() * (CROWD_OUTER_RADIUS - CROWD_INNER_RADIUS);
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

/** @type {import("../contracts/module.js").CreateModule} */
export default function createCrowd({ root, avatars, reducedMotion }) {
  const walkers = avatars.map((spec) => {
    const mii = buildMii(spec);
    mii.position.copy(randomSpot());
    root.add(mii);
    return { mii, target: randomSpot(), timer: Math.random() * 3, phase: Math.random() * 10 };
  });

  const step = new THREE.Vector3();
  return {
    update({ dt, time, state }) {
      const speed = SPEED[state.mood] * (reducedMotion ? 0.3 : 1);
      for (const w of walkers) {
        w.timer -= dt;
        if (w.timer <= 0 || w.mii.position.distanceTo(w.target) < 0.3) {
          w.target = randomSpot();
          w.timer = RETARGET[state.mood] * (0.5 + Math.random());
        }
        step.subVectors(w.target, w.mii.position).setY(0);
        const dist = step.length();
        if (dist > 0.01) {
          step.multiplyScalar(Math.min(dist, speed * dt) / dist);
          w.mii.position.add(step);
          w.mii.rotation.y = Math.atan2(step.x, step.z);
        }
        w.mii.position.y = Math.abs(Math.sin(time * speed * 4 + w.phase)) * 0.06 * speed;
      }
    },
  };
}
