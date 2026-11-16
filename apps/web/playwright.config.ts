import { defineConfig, devices } from "@playwright/test";

// Use the system Google Chrome by default, or an explicitly configured channel.
// To use Playwright's bundled Chromium instead, set PLAYWRIGHT_CHANNEL=none (requires
// `pnpm exec playwright install chromium`, which requires external network access).
const envChannel = process.env.PLAYWRIGHT_CHANNEL;
const channel =
  envChannel === "none"
    ? undefined
    : (envChannel as "chrome" | "chromium" | undefined) || "chrome";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(channel ? { channel } : {}),
      },
    },
  ],
});
