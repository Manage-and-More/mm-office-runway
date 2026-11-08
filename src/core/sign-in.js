// Sign-in with a 6-digit email code: the shared M&M sign-in (mm-platform), one account for every M&M
// app, no passwords. The platform decides who may sign in at all; these helpers only turn its answers
// into friendly messages. Used by the member bar (main page) and the admin page.

export const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

/** Emails a sign-in code. Resolves to an error message, or null when the code is on its way. */
export async function sendCode(supabase, email) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (!error) return null;
  if (error.status === 429) return "Too many codes requested. Wait a minute and try again.";
  // The platform's sign-up hook refuses addresses outside the allowed domains with its own message.
  if (/cannot be used/i.test(error.message)) return error.message;
  return "We couldn't send a code. Try again.";
}

/** Signs in with the code from the email. Resolves to an error message, or null when signed in. */
export async function verifyCode(supabase, email, code) {
  const token = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return "The code has 6 digits.";
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  return error ? "That code is wrong or has expired." : null;
}

/** Ends this browser's session only. The default ("global") would sign the person out of every M&M app. */
export const signOut = (supabase) => supabase.auth.signOut({ scope: "local" });
