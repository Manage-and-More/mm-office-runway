// Name tags over the real donors' Miis, for signed-in members only: "you" over your own Mii, a heart
// over Miis that donated, and a hover label with the name and what they gave. Public viewers get
// nothing from this layer: it stays empty until the member bar hands it data from the database.
import * as THREE from "three";

const HOVER_RADIUS = 36; // px
const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/**
 * @param {{ camera: THREE.Camera, miis: () => THREE.Object3D[], onPick?: (id: string, info: object) => void }} deps
 *   miis come from the crowd (names `mii:<id>`); onPick fires when a signed-in member clicks a tagged Mii.
 */
export function createPeople({ camera, miis, onPick }) {
  const layer = document.createElement("div");
  layer.className = "people";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);

  /** @type {Map<string, { name?: string, mine: boolean, donated: number, count: number }> | null} */
  let data = null;
  const tags = new Map(); // id → { el, mii }
  const head = new THREE.Vector3();
  const pointer = { x: -1e9, y: -1e9 };
  let hovered = null;
  addEventListener("pointermove", (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  addEventListener("pointerleave", () => { pointer.x = -1e9; pointer.y = -1e9; });
  let downAt = null;
  addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  addEventListener("click", (e) => {
    if (!data || !hovered || !onPick || e.target.closest("button, a, dialog, .member-bar, .hud, .nav")) return;
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return; // that was a drag (orbit), not a click
    onPick(hovered, tags.get(hovered)?.info);
  });

  function label(info, expanded) {
    const latest = info.moments?.[0];
    if (!expanded) return info.mine ? "⭐ you" : latest ? latest.emoji : info.donated > 0 ? "💛" : "·";
    const parts = [info.mine ? `⭐ you${info.name ? ` · ${info.name}` : ""}` : info.name || "member"];
    for (const m of info.moments || []) parts.push(`${m.emoji} ${m.text}`);
    if (info.donated > 0) parts.push(`💛 ${euro.format(info.donated)} · ${info.count} payment${info.count === 1 ? "" : "s"}`);
    return parts.join("\n");
  }

  function rebuildTags() {
    for (const { el } of tags.values()) el.remove();
    tags.clear();
    if (!data) return;
    for (const mii of miis() || []) {
      const id = mii.name?.startsWith("mii:") ? mii.name.slice(4) : null;
      const info = id && data.get(id);
      if (!info) continue;
      const el = document.createElement("span");
      el.className = "people-tag" + (info.mine ? " me" : "") + (info.donated > 0 || info.moments?.length ? " donor" : "");
      el.textContent = label(info, false);
      el.hidden = true;
      layer.append(el);
      tags.set(id, { el, mii, info });
    }
  }

  return {
    /** Data from the member bar (signed in), or null when signed out. */
    setData(next) {
      data = next;
      rebuildTags();
      layer.hidden = !data;
    },
    update() {
      if (!data) return;
      if (tags.size === 0 && (miis()?.length ?? 0) > 0) rebuildTags(); // the crowd rebuilt itself
      let nearest = null, nearestDist = HOVER_RADIUS;
      for (const [id, tag] of tags) {
        const { el, mii } = tag;
        if (!mii.visible) { el.hidden = true; continue; }
        const joint = mii.userData.joints?.head;
        if (joint) joint.getWorldPosition(head); else head.copy(mii.position);
        head.y += 0.5;
        head.project(camera);
        if (head.z > 1) { el.hidden = true; continue; }
        const x = (head.x + 1) / 2 * innerWidth, y = (1 - head.y) / 2 * innerHeight;
        tag.x = x; tag.y = y;
        el.hidden = false;
        el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
        const d = Math.hypot(pointer.x - x, pointer.y - y);
        if (d < nearestDist) { nearest = id; nearestDist = d; }
      }
      if (nearest !== hovered) {
        if (hovered && tags.has(hovered)) { const t = tags.get(hovered); t.el.classList.remove("hover"); t.el.textContent = label(t.info, false); }
        if (nearest) { const t = tags.get(nearest); t.el.classList.add("hover"); t.el.textContent = label(t.info, true); }
        hovered = nearest;
      }
    },
  };
}
