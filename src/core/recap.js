// Highlights: a one-minute show over the live scene for one calendar month. Title card, one chapter
// per member (their Mii dances while their moments pop up), the numbers, and a group finale.
// Signed-in members start it from the bar; ?recap plays it on load. Camera moves go through
// stage.navigation, reactions through the crowd's react()/groupEmotes hooks.

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
   * @param {{ members: number, moments: number, money: string, runwayBought: string }} totals
   */
  let playing = false;
  async function play(chapters, totals, title) {
    if (playing) { console.warn("[recap] play() called while already playing"); return; }
    playing = true;
    console.info("[recap] start", chapters.length, "chapters");
    layer.hidden = false;
    document.body.classList.add("recap-playing");
    stage.navigation.reset();

    // 1. Title: slow orbit, zoomed out a little.
    stage.navigation.zoomTo(1.15);
    spin(0.0025);
    const intro = card("title", `<small>Manage and More · Monthly recap</small><h1>${esc(title)}</h1><p>what we did</p>`, 4500);
    await intro.done; await intro.remove();

    // 2. One chapter per member: the camera swings over to their Mii and follows it close up while
    //    it dances; the highlights pop up one by one and the neighbours cheer.
    spin(0);
    const tmp = new (await import("three")).Vector3();
    for (const [i, ch] of chapters.entries()) {
      const mii = (crowdRoot?.userData.miis?.() ?? []).find((m) => m.name === `mii:${ch.id}`);
      const started = performance.now();
      if (mii) {
        // Centre on the face: the head joint when the Mii has one, else a point at head height.
        const head = mii.userData.joints?.head;
        stage.navigation.focus(() => (head ? head.getWorldPosition(tmp) : mii.getWorldPosition(tmp).setY(tmp.y + 0.9)), { atHead: !!head, getHeading: () => mii.rotation.y });
        stage.navigation.zoomTo(0.24); // a portrait: the Mii fills about half the frame
      }
      await sleep(1200); // let the camera arrive before the card appears
      react(ch.id, "dance", "🎉");
      for (const other of everyone()) if (other !== ch.id && Math.random() < 0.5) react(other, "cheer");
      const c = card("chapter", `<div class="who">${esc(ch.name)}</div><ul></ul>`, 0);
      const list = c.el.querySelector("ul");
      for (const m of ch.moments) {
        react(ch.id, i % 2 ? "cheer" : "dance", m.emoji);
        const li = el("li", "", `<span>${esc(m.emoji)}</span>${esc(m.text)}`);
        list.append(li);
        requestAnimationFrame(() => li.classList.add("in"));
        await sleep(1700);
      }
      react(ch.id, "dance", "🥳");
      await sleep(Math.max(1400, 7000 - (performance.now() - started))); // every chapter gets at least 7 s on screen
      await c.remove();
    }

    // 3. The numbers: back to the whole garden.
    stage.navigation.focus(null);
    stage.navigation.zoomTo(1.5);
    spin(0.0025);
    const numbers = card("numbers", `
      <div><b>${totals.members}</b><span>member${totals.members === 1 ? "" : "s"}</span></div>
      <div><b>${totals.moments}</b><span>highlight${totals.moments === 1 ? "" : "s"}</span></div>
      ${totals.moneyRaised > 0 ? `<div><b>${esc(totals.money)}</b><span>raised</span></div><div><b>${esc(totals.runwayBought)}</b><span>of runway bought</span></div>` : ""}`, 5000);
    await numbers.done; await numbers.remove();

    // 4. Finale: everyone gathers and dances, confetti, group photo.
    stage.navigation.zoomTo(1.0); // stay above the clouds for the group shot
    crowdRoot?.userData.groupEmotes?.play("garden-dance", { busy: "replace" });
    stage.celebrate?.(1);
    await sleep(6000);
    spin(0);
    const end = card("title end", `<h1>Thank you 💚</h1><p>see you next month</p><button type="button" class="member-btn primary">▶ Play again</button>`, 0);
    end.el.querySelector("button").addEventListener("click", async () => { await end.remove(); play(chapters, totals, title); });
    await sleep(8000);
    await end.remove();
    layer.hidden = true;
    document.body.classList.remove("recap-playing");
    stage.navigation.reset();
    playing = false;
    console.info("[recap] end");
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
    runwayBought: monthlyCost > 0 ? `${(money / monthlyCost).toFixed(1)} months` : "–",
  };
  return { chapters, totals };
}

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
