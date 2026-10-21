// Loads the consented AvatarSpecs: Supabase (public_avatars view) first, then the generated
// avatar index (scripts/build-avatar-index.mjs writes it) as the offline fallback.
import { supabaseSettings, supabaseGet } from "./supabase.js";

/** @returns {Promise<import("../contracts/avatar.js").AvatarSpec[]>} */
export async function loadAvatars(url, config = {}) {
  const supabase = supabaseSettings(config);
  if (supabase) {
    try {
      const rows = await supabaseGet(supabase, "public_avatars?select=spec");
      const avatars = rows.map((r) => r.spec).filter((s) => s?.id);
      console.info(`${avatars.length} avatars from Supabase`);
      return avatars;
    } catch (err) {
      console.warn("Supabase avatars failed, using the index:", err);
    }
  }
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { avatars } = await res.json();
    console.info(`${avatars.length} avatars from ${url}`);
    return avatars;
  } catch (err) {
    console.warn(`No avatars loaded from ${url}. Run \`npm run avatars\` first.`, err);
    return [];
  }
}
