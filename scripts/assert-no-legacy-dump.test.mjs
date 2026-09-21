import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FORBIDDEN_NAMES = new Set([
  "stream-vista.zip",
  "streamvista.zip",
  "legacy-dump.json",
  "django-dump.json",
]);
const FORBIDDEN_REF = "tqzimuwozhipqgyerdff";

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === ".output") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

describe("legacy dumps stay out of git", () => {
  it("does not track stream-vista.zip or JSON dumps", () => {
    assert.equal(existsSync(join(ROOT, "stream-vista.zip")), false);
    const files = walk(ROOT);
    for (const file of files) {
      const base = file.split("/").pop();
      assert.equal(FORBIDDEN_NAMES.has(base), false, file);
    }
  });

  it("does not pin the forbidden supabase project", () => {
    const files = walk(ROOT).filter((f) => /\.(ts|tsx|js|mjs|sql|md|json|example)$/.test(f));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (file.endsWith("canonical.test.ts") || file.endsWith("canonical.ts") || file.endsWith("assert-no-legacy-dump.test.mjs")) {
        continue;
      }
      if (file.includes("secret-scan")) continue;
      assert.equal(text.includes(FORBIDDEN_REF), false, file);
    }
  });
});
