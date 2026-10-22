import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: [["list", { printSteps: true }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    actionTimeout: 15000,
    navigationTimeout: 30000,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
