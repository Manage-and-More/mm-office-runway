// End-to-end tests against the local mm-platform stack (sign-in with an emailed code, RLS). See
// docs/DATABASE.md → Local development. CI runs them on every PR (.github/workflows/ci.yml).
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://127.0.0.1:8080", trace: "retain-on-failure" },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "python3 -m http.server 8080",
    url: "http://127.0.0.1:8080/config.js",
    reuseExistingServer: !process.env.CI,
  },
});
