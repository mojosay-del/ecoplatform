import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;

if (!baseURL) {
  throw new Error("Set PLAYWRIGHT_TEST_BASE_URL to the deployed web URL before running smoke tests.");
}

export default defineConfig({
  testDir: "./tests",
  testMatch: /smoke\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-first-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-smoke",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
