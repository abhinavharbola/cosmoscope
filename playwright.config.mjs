import { defineConfig } from "@playwright/test";

const port = Number(process.env.PORT || 4173);
const custom = process.env.PW_CHROMIUM;

const args = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-webgl",
];
if (custom) args.push("--no-sandbox");

export default defineConfig({
  testDir: "test/browser",
  testMatch: "**/*.spec.mjs",
  outputDir: "test-results/artifacts",
  timeout: 120000,
  expect: { timeout: 15000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1000, height: 640 },
    deviceScaleFactor: 1,
    launchOptions: { args, ...(custom ? { executablePath: custom } : {}) },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "node test/browser/serve.mjs",
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
    env: { PORT: String(port) },
  },
});
