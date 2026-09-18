// PLACEHOLDER logo — the logo workstream replaces this whole folder's contents.
// It shows the contract in action: pieces drift apart as health drops,
// shake when money is lost and snap back together when money comes in.
import * as THREE from "three";
import { LOGO_CENTER_Y } from "../contracts/module.js";

/** @type {import("../contracts/module.js").CreateModule} */
export default function createLogo({ root, events, reducedMotion }) {
  root.position.y = LOGO_CENTER_Y;

  const material = new THREE.MeshStandardMaterial({ color: 0x00a2cc, metalness: 0.4, roughness: 0.3, flatShading: true });
  const pieces = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z += 2) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), material);
    piece.castShadow = true;
    const home = new THREE.Vector3(x, y, z * 0.5);
    piece.position.copy(home);
    piece.userData = { home, dir: home.clone().add(new THREE.Vector3().randomDirection()).normalize() };
    root.add(piece);
    pieces.push(piece);
  }

  let shake = 0; // 1 → 0 after money is lost
  let spread = 0; // eased towards (1 - health)
  events.addEventListener("fundschange", ({ detail }) => {
    if (detail.delta < 0) shake = 1;
  });

  return {
    update({ dt, time, state }) {
      spread += ((1 - state.health) - spread) * Math.min(1, dt * 2);
      shake = Math.max(0, shake - dt * 1.5);
      const jitter = reducedMotion ? 0 : shake * 0.15;
      for (const p of pieces) {
        const { home, dir } = p.userData;
        p.position.copy(home).addScaledVector(dir, spread * 2.5);
        p.position.x += (Math.random() - 0.5) * jitter;
        p.rotation.set(spread * dir.x * 2, spread * dir.y * 2, 0);
      }
      root.rotation.y = time * (reducedMotion ? 0.05 : 0.3);
      material.color.setHSL(0.53 - (1 - state.health) * 0.5, 1, 0.4);
    },
    debugUI(gui) {
      gui.add({ note: "placeholder cubes" }, "note").disable();
    },
  };
}
