import { defineConfig, devices } from "@playwright/test";
import { APP_PORT, BASE_URL, TARGET } from "./e2e/env";

/**
 * E2E_TARGET=fork (default): anvil fork of Monad testnet on :8546, app on :3140.
 * E2E_TARGET=live: Monad testnet itself with the funded key from .env.e2e, app on :3141.
 * See e2e/README.md.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    viewport: { width: 1440, height: 1000 },
  },
  projects: [{ name: TARGET, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: `node e2e/serve.mjs`,
    url: BASE_URL,
    env: { E2E_TARGET: TARGET, E2E_PORT: String(APP_PORT), E2E_SERVER: process.env.E2E_SERVER ?? "dev" },
    reuseExistingServer: process.env.E2E_REUSE === "1",
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
