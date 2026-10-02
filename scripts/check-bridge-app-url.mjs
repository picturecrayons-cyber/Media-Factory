import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/lib/bridge/env.ts", import.meta.url), "utf8");
const required = [
  'host === "bridge.streamvista.in"',
  'host.endsWith(".streamvista.in")',
  'return "https://www.crayonspictures.in"',
  'return configured.replace(/\\\/$/, "")',
];
const missing = required.filter((needle) => !source.includes(needle));
if (missing.length) {
  console.error("Bridge app URL regression check failed:", missing);
  process.exit(1);
}
console.log("Bridge app URL regression check passed.");
