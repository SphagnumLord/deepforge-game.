import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const external = process.env.DEEPFORGE_BASE_URL;
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: external || "http://127.0.0.1:5173",
    hasTouch: true,
    launchOptions: { executablePath, args: ["--no-sandbox"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1080 } } },
    ...[360, 390, 430].map((width) => ({
      name: `mobile-${width}`,
      use: { viewport: { width, height: 844 }, isMobile: true },
    })),
  ],
  webServer: external
    ? undefined
    : {
        command: "npm run dev -- --port 5173 --strictPort",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: !process.env.CI,
      },
});
