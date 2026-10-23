// Plain-fetch access to the Supabase REST API with the anon key. The public page deliberately
// loads no SDK: it only ever reads two aggregate views, and Row Level Security is the guard.

// The Supabase CLI's fixed demo anon key: identical on every machine, public by design, local only.
const LOCAL_STACK = {
  url: "http://127.0.0.1:54321",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
};

/**
 * Resolve the Supabase settings. On localhost, open any page with `?local` once to use the stack from
 * `npx supabase start` (remembered in localStorage), and `?live` to go back. See docs/AUTH.md.
 * @returns {{ url: string, anonKey: string } | null}
 */
export function supabaseSettings(config) {
  let settings = config.supabase || null;
  if (typeof localStorage !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    try {
      const params = new URLSearchParams(location.search);
      if (params.has("local")) localStorage.setItem("supabase", JSON.stringify(LOCAL_STACK));
      if (params.has("live")) localStorage.removeItem("supabase");
      const local = JSON.parse(localStorage.getItem("supabase") || "null");
      if (local?.url && local?.anonKey) settings = { ...settings, ...local };
    } catch { /* ignore a malformed override */ }
  }
  return settings?.url && settings?.anonKey ? settings : null;
}

/** GET a REST path such as `public_runway?select=*`; throws on HTTP errors. */
export async function supabaseGet(settings, path) {
  const res = await fetch(`${settings.url.replace(/\/$/, "")}/rest/v1/${path}`, {
    cache: "no-store",
    headers: { apikey: settings.anonKey, Authorization: `Bearer ${settings.anonKey}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status} for ${path}`);
  return res.json();
}
