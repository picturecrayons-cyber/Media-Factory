import { readFileSync } from "node:fs";

const baseline = readFileSync("docs/bridge-permanent-green-baseline.md", "utf8");
const required = [
  "Bridge is the business control plane and the canonical title authority.",
  "Loop is the consumer OTT runtime.",
  "Supabase remains one canonical project.",
  "Preview must route through the TanStack server output",
  "Private S3 upload must prove",
  "No fabricated rights, QC, legal, package, revenue or delivery state.",
  "Do not merge PR #24 directly to `main`"
];
for (const invariant of required) {
  if (!baseline.includes(invariant)) {
    throw new Error(`Bridge permanent baseline invariant missing: ${invariant}`);
  }
}
console.log("Bridge permanent baseline invariants present");
