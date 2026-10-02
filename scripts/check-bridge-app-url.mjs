import fs from "node:fs";

const envSource = fs.readFileSync(new URL("../src/lib/bridge/env.ts", import.meta.url), "utf8");
const originSource = fs.readFileSync(new URL("../src/lib/bridge/origin.ts", import.meta.url), "utf8");
const authSource = fs.readFileSync(new URL("../src/lib/auth/server.ts", import.meta.url), "utf8");

const required = [
  [originSource, 'BRIDGE_CANONICAL_ORIGIN = "https://www.crayonspictures.in"'],
  [originSource, 'host.endsWith(RETIRED_SUFFIX)'],
  [envSource, 'resolveBridgeCanonicalOrigin(read("APP_URL") || read("SITE_URL"), BRIDGE_CANONICAL_ORIGIN)'],
  [authSource, 'BRIDGE_CANONICAL_ORIGIN'],
  [authSource, 'normalizeOrigin(explicitBaseURL) ?? BRIDGE_CANONICAL_ORIGIN'],
];
const missing = required.filter(([source, needle]) => !source.includes(needle)).map(([, needle]) => needle);
if (missing.length) {
  console.error("Bridge app URL regression check failed:", missing);
  process.exit(1);
}
console.log("Bridge app URL regression check passed.");
