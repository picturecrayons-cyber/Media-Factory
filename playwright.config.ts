import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BRIDGE_BASE_URL;
if (!baseURL) {
  throw new Error("Set BRIDGE_BASE_URL to the dedicated Crayons Bridge Preview deployment URL.");
}

const parsedBaseURL = new URL(baseURL);
if (
  !parsedBaseURL.hostname.endsWith(".vercel.app") ||
  parsedBaseURL.hostname === "bridge-kappa-six.vercel.app" ||
  parsedBaseURL.hostname === "bridge-stream-vista-opc-pvt-ltd-s-projects.vercel.app" ||
  parsedBaseURL.hostname === "bridge-git-fix-bridg-96c1a6-stream-vista-opc-pvt-ltd-s-projects.vercel.app"
) {
  throw new Error("Safety stop: Playwright is restricted to a dedicated Vercel Preview URL, never a Production/custom domain.");
}

const headers: Record<string, string> = {};
if (process.env.VERCEL_PROTECTION_BYPASS) {
  headers["x-vercel-protection-bypass"] = process.env.VERCEL_PROTECTION_BYPASS;
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    extraHTTPHeaders: headers,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
