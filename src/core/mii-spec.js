// Shared helpers for creating a Mii spec: the editor uses them for "Random look", the page uses
// them when an admin adds a moment for a member who has no Mii yet.

/** Mii id from the account: arnav.singh@… → arnav-singh. Stable per person. */
export const idFromEmail = (email) => email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "member";

/** A random, consent-less look (no id, no consent, no name). Callers add what they need. */
export function randomLook(schema) {
  const p = schema.properties;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const skin = ["#f8d9c4", "#f1c7a3", "#e0ac7e", "#c89572", "#a9714b", "#8d5a3b", "#5c3a21"];
  const hair = ["#1b1b1b", "#2e1b10", "#6b3e26", "#a65e2e", "#d9a066", "#e8d7a7", "#8c8c8c", "#c8102e"];
  const shirts = ["#00a2cc", "#ff4fd8", "#7cffcb", "#ffd166", "#ef476f", "#118ab2", "#06d6a0", "#8338ec"];
  const eyes = ["#2b1d14", "#3b5b7a", "#4a3222", "#2f6b3a", "#5a7d9a"];
  return {
    head: { shape: pick(p.head.properties.shape.enum), skinTone: pick(skin) },
    hair: { style: pick(p.hair.properties.style.enum), color: pick(hair) },
    eyes: { style: pick(p.eyes.properties.style.enum), color: pick(eyes) },
    eyebrows: pick(p.eyebrows.enum), nose: pick(p.nose.enum), mouth: pick(p.mouth.enum),
    glasses: pick(p.glasses.enum), facialHair: pick(p.facialHair.enum), shirtColor: pick(shirts),
    height: Math.round((0.85 + Math.random() * 0.3) * 100) / 100,
  };
}

/**
 * Find or create the Mii for an MM address (admins only for others). Created Miis are anonymous,
 * random and marked unclaimed until the person signs in and saves them.
 * @returns {Promise<{ id: string, name: string, created: boolean }>}
 */
export async function ensureMii(supabase, email, schemaUrl) {
  const { data: existing, error } = await supabase.from("avatars").select("id, spec").eq("owner_email", email).maybeSingle();
  if (error) throw error;
  if (existing) return { id: existing.id, name: existing.spec?.displayName || email.split("@")[0], created: false };
  const schema = await (await fetch(schemaUrl, { cache: "no-store" })).json();
  const base = idFromEmail(email);
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = attempt ? `${base}-${attempt + 1}` : base;
    const spec = { ...randomLook(schema), id, consent: { public: true, givenOn: new Date().toISOString().slice(0, 10) } };
    const { error } = await supabase.from("avatars").insert({ id, spec, owner_email: email, claimed: false });
    if (!error) return { id, name: email.split("@")[0], created: true };
    if (error.code !== "23505") throw error; // anything but "id already taken"
  }
  throw new Error(`Couldn't find a free Mii id for ${email}`);
}
