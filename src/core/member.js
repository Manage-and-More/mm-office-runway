// Member bar on the public page: sign in without leaving the 3D page, then add a payment or open the
// Mii editor in a popup. Everyone signed in with an MM account is an editor; the admin page (/admin/)
// stays admins-only. supabase-js loads lazily, so public viewers never download it.
import { supabaseSettings } from "./supabase.js";

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
 * @param {{ onPaymentAdded: () => Promise<void>, people?: { setData(map: Map | null): void } }} hooks
 *   onPaymentAdded runs right after a payment lands; people gets the name-tag data (signed in) or null.
 */
export function createMemberBar(config, { onPaymentAdded, people }) {
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
    const [{ data: avatars }, { data: payments }] = await Promise.all([
      sb.from("avatars").select("id, spec, owner_email"),
      sb.from("payments").select("donor_id, amount"),
    ]);
    const map = new Map();
    // Members see who everyone is: the chosen display name, or else the account name (never shown to the public).
    myMii = null;
    for (const a of avatars || []) {
      const name = a.spec?.displayName || a.owner_email.split("@")[0];
      map.set(a.id, { name, mine: a.owner_email === email, donated: 0, count: 0 });
      if (a.owner_email === email) myMii = { id: a.id, name };
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
      el("button", { type: "button", class: "member-btn primary", onclick: () => openPayment() }, ["💶 Add payment"]),
      el("button", { type: "button", class: "member-btn", onclick: () => openMiis() }, ["🧑‍🎨 My Mii"]),
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
    d.addEventListener("close", () => d.remove());
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

  async function openPayment() {
    const sb = await client();
    const amount = el("input", { type: "number", min: "0.01", step: "0.01", required: true, inputmode: "decimal", autofocus: true });
    const date = el("input", { type: "date", required: true, value: today() });
    const kind = el("select", {}, ["donation", "sponsorship", "other"].map((k) => new Option(k, k)));
    const payer = el("input", { type: "text", maxlength: 120, placeholder: "name or company" });
    const donor = el("select", {}, [new Option("none", "")]);
    const note = el("input", { type: "text", maxlength: 300 });
    const mineBox = el("input", { type: "checkbox", checked: !!myMii });
    const others = el("div", { class: "member-grid", hidden: !!myMii }, [
      el("label", {}, ["Who paid (optional)", payer]), el("label", {}, ["Their Mii (optional)", donor]),
    ]);
    mineBox.addEventListener("change", () => { others.hidden = mineBox.checked; });
    const box = el("p", { class: "member-notice" });
    const form = el("form", { class: "member-form" }, [
      el("p", { class: "muted" }, ["Payer names stay private; only the total reaches the page."]),
      el("div", { class: "member-grid" }, [
        el("label", {}, ["Amount (€)", amount]), el("label", {}, ["Received on", date]), el("label", {}, ["Kind", kind]),
      ]),
      el("label", { class: "member-check" }, [mineBox, myMii ? ` This is my own payment (linked to my Mii, ${myMii.name})` : " This is my own payment (create your Mii first to link it)"]),
      others,
      el("label", {}, ["Note (optional)", note]),
      el("div", { class: "member-row" }, [el("button", { type: "submit", class: "member-btn primary" }, ["Add payment 🎉"])]),
      box,
    ]);
    const d = dialog("Money came in", form);
    sb.from("avatars").select("id, spec, owner_email").order("owner_email").then(({ data }) => {
      for (const a of data || []) donor.append(new Option(`${a.spec.displayName || a.owner_email.split("@")[0]}`, a.id));
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const mine = mineBox.checked;
      const { error } = await sb.from("payments").insert({
        amount: Number(amount.value), received_on: date.value, kind: kind.value,
        payer_name: mine ? (myMii?.name || email.split("@")[0]) : (payer.value.trim() || null),
        donor_id: mine ? (myMii?.id || null) : (donor.value || null),
        note: note.value.trim() || null,
      });
      if (error) return msg(box, error.message, true);
      d.close();
      await onPaymentAdded(); // re-read the runway now: the crowd cheers for real money
      loadPeople();
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
      sync(session);
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
