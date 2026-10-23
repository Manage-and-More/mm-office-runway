// Admin page: sign in with a Manage and More account (Supabase Auth). Admins (public.admins) get the
// full lists with edit/delete plus the admin list; everyone else adds payments and Miis on the runway
// page. Nothing here grants access: Row Level Security does (supabase/migrations).
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { supabaseSettings } from "../src/core/supabase.js";
import { ensureMii } from "../src/core/mii-spec.js";

const $ = (id) => document.getElementById(id);
const views = [...document.querySelectorAll("[data-view]")];
function show(name) {
  for (const v of views) v.hidden = v.dataset.view !== name;
}

// A password-reset link lands here with type=recovery in the hash. Read it before supabase-js
// consumes the hash, because its PASSWORD_RECOVERY event fires before we can subscribe to it.
const arrivedForRecovery = /type=recovery/.test(location.hash);

const s = supabaseSettings(config);
if (!s?.url || !s?.anonKey) {
  show("unconfigured");
} else {
  main(createClient(s.url, s.anonKey));
}

async function main(supabase) {
  let recovering = arrivedForRecovery; // cleared once a new password is saved
  let dataBound = false; // the data forms get their listeners once
  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const today = () => new Date().toISOString().slice(0, 10);
  // Subscribe first, then read the session. Defer the render: calling other supabase-js methods
  // inside this callback deadlocks on the auth lock. INITIAL_SESSION is rendered via getSession() below.
  supabase.auth.onAuthStateChange((event, next) => {
    if (event === "PASSWORD_RECOVERY") recovering = true;
    if (event !== "INITIAL_SESSION") setTimeout(() => render(next), 0);
  });
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.warn("Session check failed:", error);
  render(session);

  const here = location.origin + location.pathname; // the page itself; allow-listed in Supabase Auth
  const domains = s.allowedEmailDomains || [];
  $("domain-hint").textContent = domains.map((d) => "@" + d).join(", ") || "your MM address";
  const notice = (text) => { $("signin-notice").textContent = text; $("signin-error").textContent = ""; };
  const fail = (text) => { $("signin-error").textContent = text; $("signin-notice").textContent = ""; };

  // Friendly early check. The database trigger is the real guard and rejects the sign-up anyway.
  function domainOk(email) {
    const dom = email.split("@")[1] || "";
    if (domains.length && !domains.includes(dom)) {
      fail(`Only ${domains.map((d) => "@" + d).join(" and ")} addresses can sign in.`);
      return false;
    }
    return true;
  }
  const credentials = () => ({ email: $("email").value.trim().toLowerCase(), password: $("password").value });

  $("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { email, password } = credentials();
    if (!domainOk(email)) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) fail(error.message === "Email not confirmed" ? "Please confirm your email first (check your inbox)." : error.message);
  });

  $("signup").addEventListener("click", async () => {
    const { email, password } = credentials();
    if (!$("password-form").reportValidity() || !domainOk(email)) return;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: here } });
    if (error) return fail(error.message.includes("Database error") ? "This address can't be used to sign in." : error.message);
    // Supabase returns a user with no identities when the address already exists (to avoid leaking accounts).
    if (data.user && data.user.identities?.length === 0) return notice("This address already has an account. Log in, or use \"Forgot password?\".");
    notice(`Almost there: open the confirmation link we sent to ${email}, then log in.`);
  });

  $("forgot").addEventListener("click", async () => {
    const { email } = credentials();
    if (!email) return fail("Enter your email first.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: here });
    if (error) fail(error.message); else notice(`If ${email} has an account, a reset link is on its way.`);
  });

  $("new-password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: $("new-password").value });
    if (error) $("new-password-error").textContent = error.message;
    else { recovering = false; render((await supabase.auth.getSession()).data.session); }
  });

  $("signout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    render(null);
  });

  // Google: built, hidden until an MM-owned OAuth client exists (config.supabase.googleSignIn).
  $("signin-google").hidden = !s.googleSignIn;
  $("signin-google").addEventListener("click", async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: here, queryParams: { hd: domains[0] || "", prompt: "select_account" } },
    });
    if (error) fail(error.message);
  });

  // The URL may carry an error from an email link or OAuth round-trip (expired link, rejected account, …).
  const params = new URLSearchParams(location.hash.slice(1) || location.search);
  if (params.get("error_description")) {
    fail(decodeURIComponent(params.get("error_description").replace(/\+/g, " ")));
    history.replaceState(null, "", location.pathname);
  }

  async function render(session) {
    $("who").hidden = !session;
    if (!session) { show("signed-out"); return; }
    if (recovering) { show("new-password"); return; }
    const email = (session.user.email || "").toLowerCase();
    $("who-email").textContent = email;

    // Every signed-in MM account is an editor and adds payments and Miis on the runway page itself.
    // This page, with edit/delete and the admin list, is for admins (the rows of public.admins).
    const { data: admins, error } = await supabase.from("admins").select("email, added_by").order("email");
    if (error) { console.error("Admins lookup failed:", error); fail(error.message); return; }
    const isAdmin = admins.some((a) => a.email === email);
    if (!isAdmin) { $("not-admin-email").textContent = email; show("not-admin"); return; }
    show("editor");
    $("admin-tools").hidden = false;
    await Promise.all([renderData(), renderAdminTools(email, admins)]);
  }

  // ───────────────────────────── runway data: payments, costs, balances ─────────────────────────────

  async function renderData() {
    if (!dataBound) { bindDataForms(); dataBound = true; }
    await Promise.all([renderRunwayNow(), renderMoments(), renderCosts(), renderBalances()]);
  }

  async function renderRunwayNow() {
    const { data, error } = await supabase.from("public_runway").select("funds, monthly_cost, balance_as_of").maybeSingle();
    const el = $("runway-now");
    if (error) { el.textContent = error.message; return; }
    if (!data) { el.textContent = "No numbers yet: add a monthly cost and an opening balance below."; return; }
    const months = data.monthly_cost > 0 ? data.funds / data.monthly_cost : Infinity;
    el.innerHTML = `💰 <span class="big">${esc(euro.format(data.funds))}</span> in the pot · 🔥 ${esc(euro.format(data.monthly_cost))} / month · ⏳ ${Number.isFinite(months) ? months.toFixed(1) : "∞"} months (balance as of ${esc(data.balance_as_of)})`;
  }

  function rowActions(onEdit, onDelete) {
    const td = document.createElement("td");
    const box = document.createElement("div"); box.className = "actions";
    if (onEdit) { const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = "Edit"; b.addEventListener("click", onEdit); box.append(b); }
    const d = document.createElement("button"); d.type = "button"; d.className = "small danger"; d.textContent = "Delete"; d.addEventListener("click", onDelete); box.append(d);
    td.append(box);
    return td;
  }

  const KIND_LABEL = { donation: "💛 raised", sponsorship: "💛 raised", other: "💛 raised" };
  let miiNames = new Map(); // avatar id → { name, email }

  async function renderMoments() {
    const errorEl = $("moments-error");
    const [{ data: avatars, error: e0 }, { data: moments, error: e1 }, { data: payments, error: e2 }] = await Promise.all([
      supabase.from("avatars").select("id, spec, owner_email"),
      supabase.from("moments").select("id, owner_email, emoji, text, happened_on, created_by").order("happened_on", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("payments").select("id, amount, received_on, kind, payer_name, donor_id, note, created_by").order("received_on", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (e0 || e1 || e2) { errorEl.textContent = (e0 || e1 || e2).message; return; }
    miiNames = new Map((avatars || []).map((a) => [a.id, { name: a.spec?.displayName || a.owner_email.split("@")[0], email: a.owner_email }]));
    const rows = [
      ...(moments || []).map((m) => ({ table: "moments", id: m.id, date: m.happened_on, what: `${m.emoji} ${m.text}`, who: m.owner_email.split("@")[0], whoTitle: m.owner_email, by: m.created_by, raw: m })),
      ...(payments || []).map((p) => ({ table: "payments", id: p.id, date: p.received_on, what: `${KIND_LABEL[p.kind] || p.kind} · ${euro.format(p.amount)}${p.note ? ` · ${p.note}` : ""}`, who: p.donor_id ? (miiNames.get(p.donor_id)?.name || p.payer_name || "") : (p.payer_name || ""), whoTitle: p.donor_id ? miiNames.get(p.donor_id)?.email || "" : "", by: p.created_by, raw: p })),
    ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    $("moments-rows").replaceChildren(...rows.map((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${esc(r.date)}</td><td class="wrap">${esc(r.what)}</td><td class="wrap" title="${esc(r.whoTitle)}">${esc(r.who)}</td><td class="muted by" title="${esc(r.by || "")}">${esc(who(r.by))}</td>`;
      tr.append(rowActions(() => editRow(r), async () => {
        const { error } = await supabase.from(r.table).delete().eq("id", r.id);
        if (error) errorEl.textContent = error.message; else { await renderMoments(); await renderRunwayNow(); }
      }));
      return tr;
    }));
  }

  function showKindFields() {
    const kind = $("moment-kind").value;
    for (const label of $("moment-form").querySelectorAll("label[data-for]")) label.hidden = !label.dataset.for.split(" ").includes(kind);
  }

  function editRow(r) {
    $("moment-id").value = r.id; $("moment-table").value = r.table;
    if (r.table === "moments") {
      $("moment-kind").value = "moment"; $("moment-date").value = r.raw.happened_on; $("moment-email").value = r.raw.owner_email;
      $("moment-text").value = r.raw.text;
    } else {
      $("moment-kind").value = "money";
      $("moment-date").value = r.raw.received_on; $("moment-amount").value = r.raw.amount; $("moment-note").value = r.raw.note || "";
      $("moment-email").value = r.raw.donor_id ? (miiNames.get(r.raw.donor_id)?.email || "") : "";
    }
    showKindFields();
    $("moment-save").textContent = "Save changes"; $("moment-cancel").hidden = false;
    $("moment-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetMomentForm() {
    $("moment-form").reset(); $("moment-id").value = ""; $("moment-table").value = ""; $("moment-date").value = today();
    showKindFields();
    $("moment-save").textContent = "Add highlight"; $("moment-cancel").hidden = true;
  }

  async function renderCosts() {
    const errorEl = $("costs-error");
    const { data, error } = await supabase.from("monthly_costs").select("amount, effective_from").lte("effective_from", today()).order("effective_from", { ascending: false }).limit(1).maybeSingle();
    if (error) { errorEl.textContent = error.message; return; }
    $("cost-amount").value = data ? data.amount : "";
    $("cost-since").textContent = data ? `since ${data.effective_from}` : "not set yet";
  }

  async function renderBalances() {
    const errorEl = $("balances-error");
    const { data, error } = await supabase.from("opening_balances").select("amount, as_of, created_by").lte("as_of", today()).order("as_of", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) { errorEl.textContent = error.message; return; }
    $("balance-amount").value = data ? data.amount : "";
    $("balance-since").textContent = data ? `as of ${data.as_of}, by ${who(data.created_by)}` : "not set yet";
  }

  function bindDataForms() {
    resetMomentForm();
    $("moment-kind").addEventListener("change", showKindFields);
    $("moment-cancel").addEventListener("click", resetMomentForm);

    $("moment-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = $("moments-error"); errorEl.textContent = "";
      const kind = $("moment-kind").value, date = $("moment-date").value;
      const id = $("moment-id").value, table = $("moment-table").value;
      const emailFor = $("moment-email").value.trim().toLowerCase();
      try {
        if (kind === "moment") {
          if (!emailFor.includes("@")) throw new Error("Enter the member's MM address.");
          if (!$("moment-text").value.trim()) throw new Error("Say what they did, in a few words.");
          await ensureMii(supabase, emailFor, "../src/contracts/avatar.schema.json");
          const row = { owner_email: emailFor, text: $("moment-text").value.trim(), happened_on: date };
          const { error } = id && table === "moments" ? await supabase.from("moments").update(row).eq("id", id) : await supabase.from("moments").insert(row);
          if (error) throw error;
          if (id && table === "payments") await supabase.from("payments").delete().eq("id", id); // kind changed: move it over
        } else {
          // Raised money: credited to the member who brought it in; the note says where it came from.
          const amount = Number($("moment-amount").value);
          if (!(amount > 0)) throw new Error("Enter the amount.");
          if (!emailFor.includes("@")) throw new Error("Enter the member's MM address.");
          const mii = await ensureMii(supabase, emailFor, "../src/contracts/avatar.schema.json");
          const row = { amount, received_on: date, kind: "donation", payer_name: mii.name, donor_id: mii.id, note: $("moment-note").value.trim() || null };
          const { error } = id && table === "payments" ? await supabase.from("payments").update(row).eq("id", id) : await supabase.from("payments").insert(row);
          if (error) throw error;
          if (id && table === "moments") await supabase.from("moments").delete().eq("id", id);
        }
      } catch (err) { errorEl.textContent = err.message; return; }
      resetMomentForm();
      await Promise.all([renderMoments(), renderRunwayNow()]);
    });

    $("cost-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = $("costs-error"); errorEl.textContent = "";
      // The new cost applies from today; the history stays in the table for the record.
      const { error } = await supabase.from("monthly_costs").upsert({ amount: Number($("cost-amount").value), effective_from: today() }, { onConflict: "effective_from" });
      if (error) { errorEl.textContent = error.message; return; }
      await Promise.all([renderCosts(), renderRunwayNow()]);
    });

    $("balance-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = $("balances-error"); errorEl.textContent = "";
      // Today's balance. Re-saving today replaces today's row but keeps its "recorded at" moment fresh,
      // so payments entered after this click count on top of it (see the rule in docs/DATABASE.md).
      const amount = Number($("balance-amount").value);
      const { error } = await supabase.from("opening_balances").upsert({ amount, as_of: today(), created_at: new Date().toISOString() }, { onConflict: "as_of" });
      if (error) { errorEl.textContent = error.message; return; }
      await Promise.all([renderBalances(), renderRunwayNow()]);
    });
  }

  async function renderAdminTools(myEmail, admins) {
    const rows = $("admins-rows");
    const errorEl = $("admins-error");
    errorEl.textContent = "";

    async function refresh(list) {
      if (!list) {
        const { data, error } = await supabase.from("admins").select("email, added_by").order("email");
        if (error) { errorEl.textContent = error.message; return; }
        list = data;
      }
      rows.replaceChildren(...list.map((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${esc(row.email)}</td><td class="muted">${esc(row.added_by || "")}</td><td></td>`;
        if (row.email !== myEmail) {
          const btn = document.createElement("button");
          btn.type = "button"; btn.className = "danger"; btn.textContent = "Remove";
          btn.addEventListener("click", async () => {
            const { error } = await supabase.from("admins").delete().eq("email", row.email);
            if (error) errorEl.textContent = error.message; else refresh();
          });
          tr.lastElementChild.append(btn);
        }
        return tr;
      }));
      const { data: domains, error } = await supabase.from("allowed_email_domains").select("domain").order("domain");
      if (error) { errorEl.textContent = error.message; return; }
      $("domains").replaceChildren(...domains.map((d) => { const li = document.createElement("li"); li.textContent = d.domain; return li; }));
    }

    $("add-admin").onsubmit = async (e) => {
      e.preventDefault();
      errorEl.textContent = "";
      const email = $("new-email").value.trim().toLowerCase();
      const { error } = await supabase.from("admins").insert({ email });
      if (error) errorEl.textContent = error.message;
      else { $("new-email").value = ""; refresh(); }
    };

    await refresh(admins);
  }
}

const who = (email) => (email || "").split("@")[0];

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
