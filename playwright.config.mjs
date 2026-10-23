import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { headless: true },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
