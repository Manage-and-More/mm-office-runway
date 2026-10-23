// Highlights: a one-minute show over the live scene for one calendar month. Title card, one chapter
// per member (their Mii dances while their moments pop up), the numbers, and a group finale.
// Signed-in members start it from the bar; ?recap plays it on load. Camera moves go through
// stage.navigation, reactions through the crowd's react()/groupEmotes hooks.

import { createMusic } from "./music.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

/**
 * @param {{ stage: any, crowdRoot: any, monthLabel: string }} deps
 */
export function createRecap({ stage, crowdRoot }) {
  const layer = el("div", "recap");
  layer.hidden = true;
  document.body.append(layer);
  let spinning = false;

  function spin(speed) {
    spinning = speed !== 0;
    const step = () => { if (!spinning) return; stage.navigation.rotate(speed); requestAnimationFrame(step); };
    if (spinning) requestAnimationFrame(step);
  }
  const card = (cls, html, ms) => {
    console.info(`[recap] card ${cls}`);
    const c = el("div", `recap-card ${cls}`, html);
    layer.append(c);
    requestAnimationFrame(() => c.classList.add("in"));
    return { remove: async () => { c.classList.remove("in"); await sleep(400); c.remove(); }, el: c, done: sleep(ms) };
  };
  const react = (id, action, emoji) => crowdRoot?.userData.react?.(id, action, emoji);
  const everyone = () => (crowdRoot?.userData.miis?.() ?? []).map((m) => m.name.replace(/^mii:/, ""));

  /**
   * @param {{ id: string, name: string, moments: { emoji: string, text: string }[] }[]} chapters  one per member
   * @param {{ members: number, moments: number, money: string, moneyRaised: number }} totals
   */
  const music = createMusic();
  let playing = false, skip = false, onEscape = null;
  addEventListener("keydown", (e) => { if (e.key === "Escape" && playing) { if (onEscape) onEscape(); else skip = true; } });

  function finish() {
    if (crowdRoot?.userData.groupEmotes?.getStatus().emote === "recap-circle") crowdRoot.userData.groupEmotes.cancel();
    for (const c of layer.querySelectorAll(".recap-card, .recap-skip, .recap-sound")) c.remove();
    music.stop();
    spin(0);
    layer.hidden = true;
    document.body.classList.remove("recap-playing");
    stage.navigation.reset();
    playing = false;
    console.info("[recap] end");
  }

  async function play(chapters, totals, title) {
    if (playing) { console.warn("[recap] play() called while already playing"); return; }
    playing = true; skip = false;
    console.info("[recap] start", chapters.length, "chapters");
    layer.hidden = false;
    // ✕ Skip (or Escape) ends the show at the next step.
    const skipBtn = el("button", "member-btn recap-skip", "✕ Skip");
    skipBtn.type = "button";
    skipBtn.addEventListener("click", () => { skip = true; });
    const soundBtn = el("button", "member-btn recap-sound", music.muted ? "🔇 Music off" : "🔊 Music on");
    soundBtn.type = "button"; soundBtn.title = "Toggle the music";
    soundBtn.addEventListener("click", () => { soundBtn.textContent = music.toggle() ? "🔇 Music off" : "🔊 Music on"; music.start(); });
    layer.append(skipBtn, soundBtn);
    music.start(); // silent until the browser allows sound (needs a click: the Recap button or this toggle)
    const sleep = async (ms) => { for (let left = ms; left > 0 && !skip; left -= 100) await new Promise((r) => setTimeout(r, Math.min(100, left))); };
    document.body.classList.add("recap-playing");
    stage.navigation.reset();

    // 1. Title: slow orbit, zoomed out a little.
    stage.navigation.zoomTo(1.15);
    spin(0.0025);
    const intro = card("title", `<small>Manage and More · Monthly recap</small><h1>${esc(title)}</h1><p>what we did</p>`, 3500);
    await intro.done; await intro.remove();

    // 2. Everyone forms a ring around the garden facing outward (nobody can stand in front of
    //    anyone), then one chapter per member: the camera moves round the ring to their face while
    //    they dance; the highlights pop up one by one and the neighbours cheer.
    spin(0);
    const emotes = crowdRoot?.userData.groupEmotes;
    const ring = !!emotes?.play("recap-circle", { busy: "replace" });
    if (ring) for (let i = 0; i < 56 && emotes.getStatus().phase === "formation" && !skip; i++) await sleep(250); // up to 14 s to gather
    const tmp = new (await import("three")).Vector3();
    for (const [i, ch] of chapters.entries()) {
      if (skip) break;
      const mii = (crowdRoot?.userData.miis?.() ?? []).find((m) => m.name === `mii:${ch.id}`);
      const started = performance.now();
      if (mii) {
        // Centre on the face: the head joint when the Mii has one, else a point at head height.
        const head = mii.userData.joints?.head;
        const others = (crowdRoot?.userData.miis?.() ?? []).filter((m) => m !== mii);
        stage.navigation.focus(() => (head ? head.getWorldPosition(tmp) : mii.getWorldPosition(tmp).setY(tmp.y + 0.9)), {
          atHead: !!head,
          // In the ring everyone faces outward, so the camera stands outside the ring looking in.
          getHeading: () => (ring ? Math.atan2(mii.position.x, mii.position.z) : mii.rotation.y),
          avoid: () => others.filter((m) => m.visible).map((m) => m.position), // nobody blocks the face
        });
        stage.navigation.zoomTo(0.24); // a portrait: the Mii fills about half the frame
      }
      await sleep(800); // let the camera arrive before the card appears
      react(ch.id, "dance", "🎉");
      for (const other of everyone()) if (other !== ch.id && Math.random() < 0.5) react(other, "cheer");
      const c = card("chapter", `<div class="who">${esc(ch.name)}</div><ul></ul>`, 0);
      const list = c.el.querySelector("ul");
      for (const m of ch.moments) {
        react(ch.id, i % 2 ? "cheer" : "dance", m.emoji);
        const li = el("li", "", `<span>${esc(m.emoji)}</span>${esc(m.text)}`);
        list.append(li);
        requestAnimationFrame(() => li.classList.add("in"));
        await sleep(1200);
      }
      react(ch.id, "dance", "🥳");
      await sleep(Math.max(900, 4500 - (performance.now() - started))); // every chapter gets at least 4.5 s on screen
      await c.remove();
    }

    // 3. The numbers: back to the whole garden.
    if (skip) return finish();
    stage.navigation.focus(null);
    stage.navigation.zoomTo(1.5);
    spin(0.0025);
    const numbers = card("numbers", `
      <div><b>${totals.members}</b><span>member${totals.members === 1 ? "" : "s"}</span></div>
      <div><b>${totals.moments}</b><span>highlight${totals.moments === 1 ? "" : "s"}</span></div>
      ${totals.moneyRaised > 0 ? `<div><b>${esc(totals.money)}</b><span>raised</span></div>` : ""}`, 4000);
    await numbers.done; await numbers.remove();

    // 4. Finale: everyone gathers and dances, confetti, group photo.
    stage.navigation.zoomTo(1.0); // stay above the clouds for the group shot
    crowdRoot?.userData.groupEmotes?.cancel();
    crowdRoot?.userData.groupEmotes?.play("garden-dance", { busy: "replace" });
    stage.celebrate?.(1);
    await sleep(4000);
    spin(0);
    skipBtn.remove();
    if (skip) return finish();
    // The end card stays until a choice is made (Escape = back).
    const end = card("title end", `<h1>Thank you 💚</h1><p>see you next month</p>
      <div class="member-row" style="justify-content:center">
        <button type="button" class="member-btn primary" data-act="again">▶ Play again</button>
        <button type="button" class="member-btn" data-act="back">← Back to the garden</button>
      </div>`, 0);
    const choice = await new Promise((resolve) => {
      end.el.querySelector('[data-act="again"]').addEventListener("click", () => resolve("again"));
      end.el.querySelector('[data-act="back"]').addEventListener("click", () => resolve("back"));
      onEscape = () => resolve("back");
    });
    onEscape = null;
    await end.remove();
    finish();
    if (choice === "again") play(chapters, totals, title);
  }

  return { play };
}

/**
 * Chapters and totals for one month of moments and donations (already filtered to that month).
 * @param {{ avatars: { id: string, spec: any, owner_email: string }[], moments: { owner_email: string, emoji: string, text: string }[],
 *           payments: { donor_id: string | null, amount: number }[], monthlyCost: number }} data
 */
export function buildHighlights({ avatars, moments, payments, monthlyCost }) {
  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const byEmail = new Map(avatars.map((a) => [a.owner_email, { id: a.id, name: a.spec?.displayName || a.owner_email.split("@")[0], moments: [] }]));
  const byId = new Map([...byEmail.values()].map((c) => [c.id, c]));
  for (const m of moments) byEmail.get(m.owner_email)?.moments.push({ emoji: m.emoji, text: m.text });
  let money = 0;
  for (const p of payments) { money += Number(p.amount); const c = p.donor_id && byId.get(p.donor_id); if (c) c.moments.push({ emoji: "💛", text: `raised ${euro.format(p.amount)}` }); }
  const chapters = [...byEmail.values()].filter((c) => c.moments.length).sort((a, b) => a.moments.length - b.moments.length);
  const totals = {
    moneyRaised: money,
    members: chapters.length,
    moments: moments.length + payments.length,
    money: euro.format(money),
  };
  return { chapters, totals };
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
