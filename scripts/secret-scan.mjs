#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FORBIDDEN = [
  "tqzimuwozhipqgyerdff",
  "jpfyhahrdxbtwximsglj",
  "rzp_live_",
  "rzp_test_",
  "AKIA",
  "BEGIN PRIVATE KEY",
  "sk_live_",
];
const ALLOW_BASENAME = new Set(["secret-scan.mjs", "canonical.ts", "canonical.test.ts", "assert-no-legacy-dump.test.mjs"]);

const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === ".output" || name === ".nitro") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|sql|md|json|yml|yaml|env|example|css|html)$/.test(name)) {
      if (ALLOW_BASENAME.has(name)) continue;
      const text = readFileSync(p, "utf8");
      for (const token of FORBIDDEN) {
        if (text.includes(token)) hits.push({ file: p, token });
      }
    }
  }
}

walk(ROOT);
if (hits.length) {
  console.error("Secret scan failed:");
  for (const h of hits) console.error(`  ${h.token} in ${h.file}`);
  process.exit(1);
}
console.log("secret-scan ok");
