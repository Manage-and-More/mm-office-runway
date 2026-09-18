// Loads the generated avatar index (scripts/build-avatar-index.mjs writes it).

/** @returns {Promise<import("../contracts/avatar.js").AvatarSpec[]>} */
export async function loadAvatars(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { avatars } = await res.json();
    return avatars;
  } catch (err) {
    console.warn(`No avatars loaded from ${url}. Run \`npm run avatars\` first.`, err);
    return [];
  }
}
