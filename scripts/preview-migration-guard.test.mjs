import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migrateScript = fileURLToPath(new URL("./migrate.mjs", import.meta.url));

test("Vercel Preview exits before opening a hosted database connection", () => {
  const result = spawnSync(process.execPath, [migrateScript], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      VERCEL: "1",
      VERCEL_ENV: "preview",
      DATABASE_URL: "postgresql://preview-only:blocked@db.example.invalid:5432/postgres",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Vercel Preview detected — hosted database migrations are disabled/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/);
});
