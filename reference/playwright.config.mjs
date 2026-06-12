import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const hostedAppUrl = String(process.env.WAR_TABLE_HOSTED_URL || "").trim();
const enableWebkit = String(process.env.WAR_TABLE_ENABLE_WEBKIT || "").trim() === "1";

const projects = [
  {
    name: "chromium-local",
    use: {
      ...devices["Desktop Chrome"],
      browserName: "chromium"
    }
  }
];

if (hostedAppUrl) {
  projects.push({
    name: "chromium-hosted",
    use: {
      ...devices["Desktop Chrome"],
      browserName: "chromium"
    }
  });
}

if (enableWebkit) {
  projects.push({
    name: "webkit-local",
    use: {
      ...devices["Desktop Safari"],
      browserName: "webkit"
    }
  });
  if (hostedAppUrl) {
    projects.push({
      name: "webkit-hosted",
      use: {
        ...devices["Desktop Safari"],
        browserName: "webkit"
      }
    });
  }
}

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    trace: "on-first-retry"
  },
  webServer: {
    command: "python3 -m http.server 4173 --bind 127.0.0.1",
    port: 4173,
    reuseExistingServer: true,
    cwd: __dirname
  },
  projects
});
