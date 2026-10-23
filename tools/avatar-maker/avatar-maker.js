// My Mii: each signed-in MM member designs the one Mii that represents them on the runway page.
// A picker generated from the AvatarSpec schema's enums, a live 3D preview with the crowd's real
// buildMii, and Save / Remove against the Supabase avatars table (one row per account, enforced by
// the database). Saving is the consent to appear; "Remove my Mii" withdraws it. No admin involved.
import * as THREE from "three";
import { createClient } from "@supabase/supabase-js";
import { buildMii } from "../../src/crowd/mii.js";
import { config } from "../../config.js";
import { supabaseSettings } from "../../src/core/supabase.js";
import { idFromEmail, randomLook } from "../../src/core/mii-spec.js";

const $ = (id) => document.getElementById(id);
const views = [...document.querySelectorAll("[data-view]")];
const show = (name) => { for (const v of views) v.hidden = v.dataset.view !== name; };
const LABELS = { head: "Head", hair: "Hair", eyes: "Eyes", shape: "Shape", skinTone: "Skin tone", style: "Style", color: "Colour",
  eyebrows: "Eyebrows", nose: "Nose", mouth: "Mouth", glasses: "Glasses", facialHair: "Facial hair", shirtColor: "Shirt colour",
  height: "Height", displayName: "Name shown to other signed-in members (optional, never public)" };

// Inside the runway page's popup: no header, and tell the parent when something changed.
const embedded = new URLSearchParams(location.search).has("embed");
if (embedded) document.body.classList.add("embedded");
const notifyParent = () => { if (embedded) parent.postMessage({ type: "mii-changed" }, location.origin); };

const settings = supabaseSettings(config);
if (!settings) show("unconfigured");
else main(createClient(settings.url, settings.anonKey));

async function main(supabase) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return lock("Sign in on the runway page first, then come back here.");
  const email = (session.user.email || "").toLowerCase();
  $("who").hidden = false; $("who-email").textContent = email;
  supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") location.reload(); });

  const schema = await (await fetch("../../src/contracts/avatar.schema.json", { cache: "no-store" })).json();
  const form = createForm(schema);
  const preview = createPreview($("mii"));
  let mine = null; // my row, or null until saved

  form.onChange(() => { clearMessages(); preview.render(form.read()); });

  async function loadMine() {
    const { data, error } = await supabase.from("avatars").select("id, spec, claimed").eq("owner_email", email).maybeSingle();
    if (error) return fail(error.message);
    mine = data;
    if (mine && mine.claimed === false) {
      $("form-title").textContent = "A Mii is waiting for you";
      $("form-hint").textContent = "An admin added a highlight for you and created this Mii with a random look. Make it yours and save, or remove it.";
      $("delete").hidden = false;
      form.write(mine.spec);
    } else if (mine) {
      $("form-title").textContent = "Your Mii";
      $("form-hint").textContent = "This is you on the runway page. Change anything and save.";
      $("delete").hidden = false;
      form.write(mine.spec);
    } else {
      $("form-title").textContent = "Create your Mii";
      $("form-hint").textContent = "You don't have a Mii yet. Pick a look (or roll a random one) and save.";
      $("delete").hidden = true;
      form.write(randomLook(schema));
    }
    preview.render(form.read());
  }

  $("random").addEventListener("click", () => {
    const keep = form.read();
    form.write({ ...randomLook(schema), displayName: keep.displayName });
    preview.render(form.read());
  });

  $("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    clearMessages();
    // Saving is the consent (the disclaimer under the buttons says so); removing the Mii withdraws it.
    const spec = { ...form.read(), id: mine?.id || idFromEmail(email), consent: { public: true, givenOn: mine?.spec?.consent?.givenOn || today() } };
    const { error } = await supabase.from("avatars").upsert({ id: spec.id, spec, owner_email: email, claimed: true }, { onConflict: "id" });
    if (error) return fail(error.message);
    await loadMine();
    notifyParent();
    notice("Saved. You'll walk on the runway page from its next load.");
  });

  async function removeMine(message) {
    if (!mine) return;
    const { error } = await supabase.from("avatars").delete().eq("id", mine.id);
    if (error) return fail(error.message);
    await loadMine();
    notifyParent();
    notice(message);
  }
  $("delete").addEventListener("click", () => removeMine("Your Mii is removed. It leaves the runway page from its next load."));

  show("editor");
  preview.start();
  await loadMine();
}

function lock(reason) { $("locked-reason").textContent = reason; show("locked"); }
const notice = (t) => { $("notice").textContent = t; $("error").textContent = ""; };
const fail = (t) => { $("error").textContent = t; $("notice").textContent = ""; };
const clearMessages = () => { $("notice").textContent = ""; $("error").textContent = ""; };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ───────────────────────────── form generated from the schema ─────────────────────────────

function createForm(schema) {
  const root = $("fields");
  const listeners = new Set();
  const inputs = new Map(); // dotted path → input element
  const props = schema.properties;

  const add = (parent, path, def, label) => {
    const wrap = document.createElement("label");
    wrap.textContent = label;
    let input;
    if (def.enum) {
      input = document.createElement("select");
      for (const v of def.enum) input.append(new Option(v, v));
    } else if (def.$ref === "#/definitions/color") {
      input = document.createElement("input"); input.type = "color";
    } else if (def.type === "number") {
      input = document.createElement("input"); input.type = "range";
      input.min = def.minimum; input.max = def.maximum; input.step = "0.01";
      const hint = document.createElement("span"); hint.className = "hint";
      input.addEventListener("input", () => { hint.textContent = Number(input.value).toFixed(2); });
      wrap.append(hint);
    } else {
      input = document.createElement("input"); input.type = "text";
      if (def.maxLength) input.maxLength = def.maxLength;
    }
    input.name = path;
    input.addEventListener("input", () => listeners.forEach((l) => l()));
    wrap.append(input);
    parent.append(wrap);
    inputs.set(path, input);
  };

  // Name first, full width. The id comes from the account and consent from saving, so no fields for those.
  const identity = document.createElement("fieldset");
  identity.className = "wide";
  identity.innerHTML = "<legend>You</legend>";
  add(identity, "displayName", props.displayName, LABELS.displayName);
  root.append(identity);

  for (const [key, def] of Object.entries(props)) {
    if (["id", "displayName", "consent"].includes(key)) continue;
    const fs = document.createElement("fieldset");
    fs.innerHTML = `<legend>${esc(LABELS[key] || key)}</legend>`;
    if (def.type === "object") for (const [sub, subDef] of Object.entries(def.properties)) add(fs, `${key}.${sub}`, subDef, LABELS[sub] || sub);
    else add(fs, key, def, LABELS[key] || key);
    root.append(fs);
  }

  return {
    onChange: (l) => listeners.add(l),
    read() {
      const spec = {};
      for (const [path, input] of inputs) {
        const value = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value.trim();
        if (path === "displayName" && !value) continue; // optional: omit to stay anonymous
        const [a, b] = path.split(".");
        if (b) (spec[a] ??= {})[b] = value; else spec[a] = value;
      }
      return spec;
    },
    write(spec) {
      for (const [path, input] of inputs) {
        const [a, b] = path.split(".");
        const value = b ? spec[a]?.[b] : spec[a];
        if (input.type === "checkbox") input.checked = value === true;
        else input.value = value ?? "";
        input.dispatchEvent(new Event("input", { bubbles: false }));
      }
    },
  };
}

// ───────────────────────────── 3D preview ─────────────────────────────

function createPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 0.75, 3.1);
  camera.lookAt(0, 0.55, 0);
  let mii = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    render(spec) {
      try {
        if (mii) scene.remove(mii);
        mii = buildMii({ ...spec, id: spec.id || "preview" });
        scene.add(mii);
      } catch (err) {
        console.error("buildMii failed:", err);
      }
    },
    start() {
      renderer.setAnimationLoop((t) => {
        const size = canvas.clientWidth;
        if (size && (canvas.width !== size * renderer.getPixelRatio())) renderer.setSize(size, size, false);
        if (mii) mii.rotation.y = reduced ? 0.3 : Math.sin(t / 1400) * 0.7;
        renderer.render(scene, camera);
      });
    },
  };
}
