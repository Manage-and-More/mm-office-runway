// Member bar on the public page: sign in without leaving the 3D page, then add a payment or open the
// Mii editor in a popup. Everyone signed in with an MM account is an editor; the admin page (/admin/)
// stays admins-only. supabase-js loads lazily, so public viewers never download it.
import { supabaseSettings } from "./supabase.js";
import { ensureMii } from "./mii-spec.js";

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children);
  return node;
};
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toISOString().slice(0, 10);

/**
 * @param {object} config  the site config (config.supabase)
 * @param {{ onPaymentAdded: () => Promise<void>, onMoment?: (miiId: string | null, emoji: string) => void, people?: { setData(map: Map | null): void } }} hooks
 *   onPaymentAdded runs right after a donation lands; onMoment after a non-money moment; people gets the name-tag data (signed in) or null.
 */
export function createMemberBar(config, { onPaymentAdded, onMoment, people, playHighlights, autoplayHighlights = false }) {
  const settings = supabaseSettings(config);
  if (!settings) return;
  const domains = settings.allowedEmailDomains || [];
  const here = location.origin + location.pathname;
  const storageKey = `sb-${new URL(settings.url).hostname.split(".")[0]}-auth-token`;

  const bar = el("div", { class: "member-bar" });
  document.body.append(bar);
  let supabase = null, email = null, isAdmin = false, miiChanged = false, myMii = null; // myMii: { id, name } or null

  async function client() {
    if (supabase) return supabase;
    const { createClient } = await import("@supabase/supabase-js");
    supabase = createClient(settings.url, settings.anonKey);
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      setTimeout(() => sync(session), 0); // never call supabase-js inside its own callback
    });
    return supabase;
  }

  async function sync(session) {
    email = session?.user?.email?.toLowerCase() || null;
    isAdmin = false;
    if (email) {
      const { data } = await (await client()).from("admins").select("email").eq("email", email).maybeSingle();
      isAdmin = !!data;
    }
    render();
    await loadPeople();
  }

  // Who is who on the page: names, "you", and what each donor gave. Editors may read all of this
  // (RLS); the public page never sees it, which is why it only exists after sign-in.
  async function loadPeople() {
    if (!people) return;
    if (!email) { people.setData(null); return; }
    const sb = await client();
    const [{ data: avatars }, { data: payments }, { data: moments }] = await Promise.all([
      sb.from("avatars").select("id, spec, owner_email"),
      sb.from("payments").select("donor_id, amount"),
      sb.from("moments").select("owner_email, emoji, text, happened_on").order("happened_on", { ascending: false }).limit(300),
    ]);
    const map = new Map();
    // Members see who everyone is: the chosen display name, or else the account name (never shown to the public).
    myMii = null;
    for (const a of avatars || []) {
      const name = a.spec?.displayName || a.owner_email.split("@")[0];
      map.set(a.id, { name, mine: a.owner_email === email, donated: 0, count: 0, moments: [] });
      if (a.owner_email === email) myMii = { id: a.id, name };
    }
    const byOwner = new Map([...map.entries()].map(([id, info]) => [(avatars || []).find((a) => a.id === id)?.owner_email, info]));
    for (const m of moments || []) {
      const info = byOwner.get(m.owner_email);
      if (info && info.moments.length < 3) info.moments.push(m);
    }
    for (const p of payments || []) {
      const info = p.donor_id && map.get(p.donor_id);
      if (info) { info.donated += Number(p.amount); info.count += 1; }
    }
    people.setData(map);
  }

  function render() {
    bar.replaceChildren();
    if (!email) {
      bar.append(el("button", { type: "button", class: "member-btn", onclick: () => openSignIn() }, ["🔑 Sign in"]));
      return;
    }
    bar.append(
      el("button", { type: "button", class: "member-btn primary", onclick: () => openMoment() }, ["✨ Add a moment"]),
      el("button", { type: "button", class: "member-btn", onclick: () => openMiis() }, ["🧑‍🎨 My Mii"]),
      playHighlights ? el("button", { type: "button", class: "member-btn", onclick: () => openHighlights() }, ["🎬 Highlights"]) : "",
      isAdmin ? el("a", { class: "member-btn", href: "admin/" }, ["🛠 Admin"]) : "",
      el("span", { class: "member-who", title: email }, [email.split("@")[0]]),
      el("button", { type: "button", class: "member-btn quiet", onclick: async () => { await (await client()).auth.signOut(); } }, ["Sign out"]),
    );
  }

  // ───────────────────────────── dialogs ─────────────────────────────

  function dialog(title, body) {
    const d = el("dialog", { class: "member-dialog" }, [
      el("div", { class: "member-dialog-head" }, [el("h2", {}, [title]), el("button", { type: "button", class: "member-btn quiet", onclick: () => d.close() }, ["✕"])]),
      body,
    ]);
    d.addEventListener("close", () => { d.remove(); if (miiChanged && !document.querySelector("iframe.member-frame")) { miiChanged = false; location.reload(); } });
    document.body.append(d);
    d.showModal();
    return d;
  }
  const msg = (box, text, isError = false) => { box.textContent = text; box.className = isError ? "member-error" : "member-notice"; };

  async function openSignIn() {
    const sb = await client();
    const emailIn = el("input", { type: "email", required: true, autocomplete: "username", placeholder: domains[0] ? `first.last@${domains[0]}` : "email" });
    const passIn = el("input", { type: "password", required: true, minlength: 8, autocomplete: "current-password" });
    const box = el("p", { class: "member-notice" });
    const form = el("form", { class: "member-form" }, [
      el("p", { class: "muted" }, [`Use your Manage and More address${domains.length ? ` (@${domains.join(", @")})` : ""}.`]),
      el("label", {}, ["Email", emailIn]), el("label", {}, ["Password", passIn]),
      el("div", { class: "member-row" }, [
        el("button", { type: "submit", class: "member-btn primary" }, ["Log in"]),
        el("button", { type: "button", class: "member-btn", onclick: signUp }, ["Create account"]),
        el("button", { type: "button", class: "member-btn quiet", onclick: forgot }, ["Forgot password?"]),
      ]),
      box,
    ]);
    const d = dialog("Sign in", form);
    const creds = () => ({ email: emailIn.value.trim().toLowerCase(), password: passIn.value });
    const domainOk = (e) => { const dom = e.split("@")[1] || ""; if (domains.length && !domains.includes(dom)) { msg(box, `Only @${domains.join(" and @")} addresses can sign in.`, true); return false; } return true; };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { email, password } = creds();
      if (!domainOk(email)) return;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) msg(box, error.message === "Email not confirmed" ? "Please confirm your email first (check your inbox)." : error.message, true);
      else d.close();
    });
    async function signUp() {
      const { email, password } = creds();
      if (!form.reportValidity() || !domainOk(email)) return;
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: here } });
      if (error) return msg(box, error.message.includes("Database error") ? "This address can't be used to sign in." : error.message, true);
      if (data.user && data.user.identities?.length === 0) return msg(box, "This address already has an account. Log in, or use \"Forgot password?\".");
      msg(box, `Almost there: open the confirmation link we sent to ${email}, then log in.`);
    }
    async function forgot() {
      const { email } = creds();
      if (!email) return msg(box, "Enter your email first.", true);
      // The reset link opens the admin page, which has the "choose a new password" screen.
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL("admin/", here).href });
      msg(box, error ? error.message : `If ${email} has an account, a reset link is on its way.`, !!error);
    }
  }

  async function openMoment() {
    const sb = await client();
    const kind = el("select", {}, [new Option("✨ Moment", "moment"), new Option("💛 Raised money", "donation")]);
    const date = el("input", { type: "date", required: true, value: today() });
    const emoji = el("input", { type: "text", value: "🎉", maxlength: 8, class: "member-emoji", title: "Any emoji" });
    const text = el("input", { type: "text", maxlength: 80, placeholder: "e.g. 5 lecture visits", autofocus: true });
    const amount = el("input", { type: "number", min: "0.01", step: "0.01", inputmode: "decimal" });
    const momentFields = el("div", { class: "member-grid" }, [el("label", {}, ["Emoji", emoji]), el("label", { class: "wide" }, ["What did you do?", text])]);
    const donationFields = el("div", { class: "member-grid", hidden: true }, [el("label", {}, ["Amount (€)", amount])]);
    kind.addEventListener("change", () => { const d = kind.value === "donation"; donationFields.hidden = !d; momentFields.hidden = d; });
    // Admins can add a moment for another member, by MM address. If that person has no Mii yet,
    // one is created for them (random look, no name, unclaimed) so the moment has a figure.
    const who = el("select", {}, [new Option("me", "me"), new Option("someone else (MM address)", "other")]);
    const otherEmail = el("input", { type: "email", placeholder: domains[0] ? `first.last@${domains[0]}` : "email" });
    const otherField = el("label", { hidden: true }, ["Their MM address", otherEmail]);
    who.addEventListener("change", () => { otherField.hidden = who.value !== "other"; if (!otherField.hidden) otherEmail.focus(); });
    const box = el("p", { class: "member-notice" });
    const form = el("form", { class: "member-form" }, [
      el("p", { class: "muted" }, [myMii ? `Posted as ${myMii.name}. Only signed-in members see names.` : "Create your Mii first so moments show up on it."]),
      el("div", { class: "member-grid" }, [
        isAdmin ? el("label", {}, ["For", who]) : "",
        isAdmin ? otherField : "",
        el("label", {}, ["Kind", kind]), el("label", {}, ["When", date]),
      ]),
      momentFields, donationFields,
      el("div", { class: "member-row" }, [el("button", { type: "submit", class: "member-btn primary" }, ["Add 🎉"])]),
      box,
    ]);
    const d = dialog("Add a moment", form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      // Whose moment is it?
      let target = { email, mii: myMii, created: false };
      if (isAdmin && who.value === "other") {
        const other = otherEmail.value.trim().toLowerCase();
        if (!domainOkFor(other)) return msg(box, `Enter a ${domains.map((x) => "@" + x).join(" or ")} address.`, true);
        try {
          const found = await ensureMii(sb, other, "src/contracts/avatar.schema.json");
          target = { email: other, mii: { id: found.id, name: found.name }, created: found.created };
        } catch (err) { return msg(box, err.message, true); }
      }
      if (kind.value === "donation") {
        if (!(Number(amount.value) > 0)) return msg(box, "Enter the amount.", true);
        const { error } = await sb.from("payments").insert({
          amount: Number(amount.value), received_on: date.value, kind: "donation",
          payer_name: target.mii?.name || target.email.split("@")[0], donor_id: target.mii?.id || null,
        });
        if (error) return msg(box, error.message, true);
      } else {
        if (!text.value.trim()) return msg(box, "Say what you did, in a few words.", true);
        const { error } = await sb.from("moments").insert({ owner_email: target.email, emoji: emoji.value.trim() || "🎉", text: text.value.trim(), happened_on: date.value });
        if (error) return msg(box, error.message, true);
      }
      if (target.email !== email) {
        // Added for someone else: offer a one-click invite note, then close.
        const subject = encodeURIComponent("You're on the Manage and More runway page");
        const body = encodeURIComponent(`Hi!\n\nI just added a moment for you on our runway page: "${kind.value === "donation" ? `raised €${amount.value}` : text.value.trim()}".\n\n${target.created ? "A Mii is waiting for you too. " : ""}Sign in with your MM address and make it yours: ${here}\n\nSee you there!`);
        form.replaceChildren(
          el("p", {}, [`Added for ${target.email}.${target.created ? " A Mii was created for them; they can restyle it when they sign in." : ""}`]),
          el("div", { class: "member-row" }, [
            el("a", { class: "member-btn primary", href: `mailto:${target.email}?subject=${subject}&body=${body}` }, ["✉️ Send them a note"]),
            el("button", { type: "button", class: "member-btn", onclick: () => d.close() }, ["Done"]),
          ]),
        );
        if (kind.value === "donation") await onPaymentAdded(); else onMoment?.(target.mii?.id || null, emoji.value.trim() || "🎉");
        if (target.created) miiChanged = true; // a new figure: the crowd shows it on the next load
      } else {
        d.close();
        if (kind.value === "donation") await onPaymentAdded(); // the runway re-reads at once: the crowd cheers for real money
        else onMoment?.(myMii?.id || null, emoji.value.trim() || "🎉");
      }
      loadPeople();
    });
    const domainOkFor = (addr) => { const dom = addr.split("@")[1] || ""; return addr.includes("@") && (!domains.length || domains.includes(dom)); };
  }

  // ───────────────────────────── highlights: one month as a show ─────────────────────────────

  const monthLabel = (y, m) => new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(y, m, 1));
  const monthRange = (y, m) => {
    const pad = (n) => String(n).padStart(2, "0");
    const last = new Date(y, m + 1, 0).getDate();
    return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
  };

  async function loadMonth(y, m) {
    const sb = await client();
    const { from, to } = monthRange(y, m);
    const [{ data: avatars }, { data: moments }, { data: payments }, { data: runway }] = await Promise.all([
      sb.from("avatars").select("id, spec, owner_email"),
      sb.from("moments").select("owner_email, emoji, text, happened_on").gte("happened_on", from).lte("happened_on", to).order("happened_on"),
      sb.from("payments").select("donor_id, amount, received_on").gte("received_on", from).lte("received_on", to),
      sb.from("public_runway").select("monthly_cost").maybeSingle(),
    ]);
    return { avatars: avatars || [], moments: moments || [], payments: payments || [], monthlyCost: Number(runway?.monthly_cost || 0) };
  }

  async function openHighlights() {
    const now = new Date();
    const options = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    const select = el("select", {}, options.map((o, i) => new Option(monthLabel(o.y, o.m) + (i === 0 ? " (so far)" : ""), i)));
    const box = el("p", { class: "member-notice" });
    const form = el("form", { class: "member-form" }, [
      el("p", { class: "muted" }, ["A one-minute show of everyone's moments and donations in that month."]),
      el("label", {}, ["Month", select]),
      el("div", { class: "member-row" }, [el("button", { type: "submit", class: "member-btn primary" }, ["▶ Play"])]),
      box,
    ]);
    const d = dialog("Highlights", form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { y, m } = options[Number(select.value)];
      msg(box, "Loading…");
      const played = await playHighlights(await loadMonth(y, m), monthLabel(y, m));
      if (!played) return msg(box, `Nothing to show for ${monthLabel(y, m)} yet. Add a moment!`, true);
      d.close();
    });
  }

  function openMiis() {
    miiChanged = false;
    const frame = el("iframe", { class: "member-frame", src: "tools/avatar-maker/?embed", title: "My Mii" });
    const d = dialog("My Mii", el("div", {}, [frame, el("p", { class: "muted" }, ["Your Mii appears on the page after a reload. Closing this will reload if you changed something."])]));
    const onMessage = (e) => { if (e.origin === location.origin && e.data?.type === "mii-changed") miiChanged = true; };
    addEventListener("message", onMessage);
    d.addEventListener("close", () => { removeEventListener("message", onMessage); if (miiChanged) location.reload(); });
  }

  // ───────────────────────────── boot ─────────────────────────────

  // Cheap first paint from the stored session; the SDK only loads when needed (a click, or a link
  // from a confirmation email that must be exchanged for a session).
  const stored = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { return null; } })();
  const arrivingFromEmail = /access_token=|error_description=/.test(location.hash) || /[?&]code=/.test(location.search);
  if (stored?.user?.email || arrivingFromEmail) {
    client().then(async (sb) => {
      const { data: { session } } = await sb.auth.getSession();
      await sync(session);
      if (autoplayHighlights && session && playHighlights) { const n = new Date(); setTimeout(async () => playHighlights(await loadMonth(n.getFullYear(), n.getMonth()), monthLabel(n.getFullYear(), n.getMonth())), 1500); }
      const params = new URLSearchParams(location.hash.slice(1) || location.search);
      if (params.get("error_description")) alertBox(decodeURIComponent(params.get("error_description").replace(/\+/g, " ")));
      if (arrivingFromEmail) history.replaceState(null, "", location.pathname + (location.search.includes("local") ? "?local" : ""));
    });
  } else {
    render();
  }

  function alertBox(text) {
    dialog("Sign-in problem", el("p", { class: "member-error" }, [text]));
  }
}
