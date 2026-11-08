// The runway on the shared M&M platform, end to end against the local stack: the public page's
// anonymous reads, Row Level Security, and sign-in with an emailed code on the admin page.
import { expect, test } from "@playwright/test";

const MAIL_URL = process.env.MAIL_URL ?? "http://127.0.0.1:54324";
const API = "http://127.0.0.1:54321/rest/v1";
// The Supabase CLI's fixed local anon key (src/core/supabase.js → LOCAL_STACK): public, local only.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const anonGet = (path) => fetch(`${API}/${path}`, { headers: { apikey: ANON, "Accept-Profile": "runway" } });

/** The newest sign-in code sent to `email`, from the local inbox (Mailpit). */
async function latestCode(email) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = await res.json();
    const code = messages[0]?.Snippet.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in code arrived for ${email} at ${MAIL_URL}`);
}

async function signIn(page, email) {
  await page.goto("/admin/?local");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Code").fill(await latestCode(email));
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("anonymous visitors read the public numbers and Miis, nothing else", async () => {
  const runway = await anonGet("public_runway?select=funds,monthly_cost");
  expect(runway.status).toBe(200);
  expect((await runway.json())[0].monthly_cost).toBe(7208);

  const miis = await (await anonGet("public_avatars?select=spec")).json();
  expect(miis.length).toBe(3);
  expect(miis.every((m) => !("displayName" in m.spec))).toBe(true);

  for (const table of ["payments", "avatars", "moments", "admins"]) {
    expect((await anonGet(`${table}?select=*`)).status, `anon reads ${table}`).not.toBe(200);
  }
});

test("an admin signs in with an emailed code and sees the data", async ({ page }) => {
  await signIn(page, "admin@example.com");
  await expect(page.locator("#who-email")).toHaveText("admin@example.com");
  await expect(page.locator("#admins-rows")).toContainText("admin@example.com");
  await expect(page.locator("main")).toContainText("Example Sponsor GmbH");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Email me a code" })).toBeVisible();
});

test("a member who isn't an admin is sent back to the runway page", async ({ page }) => {
  const email = `member-${Date.now()}@example.com`;
  await signIn(page, email);
  await expect(page.locator("#not-admin-email")).toHaveText(email);
});

test("an address outside the allowed domains gets no code", async ({ page }) => {
  await page.goto("/admin/?local");
  await page.getByLabel("Email").fill("someone@gmail.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.locator("#signin-error")).toContainText("cannot be used");
});
