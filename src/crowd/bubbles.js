// Emoji speech bubbles over Miis' heads: a DOM layer positioned from the 3D head each frame.
import * as THREE from 'three';

export const PANIC_WORDS = ['😱', '💸', '🏠?', '😰', '🆘', '📦'];
export const HAPPY_WORDS = ['☕', '😊', '🎉', '💚', '🌸', '🍪'];
export const PARTY_WORDS = ['🎉', '🥳', '💶', '🙌', '❤️'];
const MAX = 12;

export function createBubbles({ camera, reducedMotion }) {
  const layer = document.createElement('div');
  layer.className = 'bubbles';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const pool = Array.from({ length: MAX }, () => {
    const el = document.createElement('span');
    el.className = 'bubble-emoji';
    el.hidden = true;
    layer.append(el);
    return { el, resident: null, until: 0 };
  });
  const head = new THREE.Vector3();
  let now = 0;

  return {
    show(resident, text, seconds = 1.6) {
      if (reducedMotion || !resident.mii.visible) return;
      const slot = pool.find(b => !b.resident) ?? pool.reduce((a, b) => (a.until < b.until ? a : b));
      slot.resident = resident; slot.until = now + seconds;
      slot.el.textContent = text; slot.el.hidden = false;
      slot.el.classList.remove('pop'); void slot.el.offsetWidth; slot.el.classList.add('pop');
    },
    update(dt) {
      now += dt;
      for (const b of pool) {
        if (!b.resident) continue;
        if (now > b.until || !b.resident.mii.visible) { b.resident = null; b.el.hidden = true; continue; }
        const joint = b.resident.mii.userData.joints?.head;
        if (joint) joint.getWorldPosition(head); else head.copy(b.resident.mii.position);
        head.y += 0.32;
        head.project(camera);
        if (head.z > 1) { b.el.hidden = true; continue; }
        b.el.hidden = false;
        b.el.style.transform = `translate(${((head.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - head.y) / 2 * innerHeight).toFixed(0)}px)`;
      }
    },
    dispose() { layer.remove(); },
  };
}
