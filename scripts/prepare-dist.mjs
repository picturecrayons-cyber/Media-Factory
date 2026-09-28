#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const STATIC = join(ROOT, ".vercel/output/static");
const PUBLIC = join(ROOT, "public");

console.log("[prepare-dist] Preparing build artifacts in dist/...");
mkdirSync(DIST, { recursive: true });

if (existsSync(STATIC)) {
  cpSync(STATIC, DIST, { recursive: true });
}
if (existsSync(PUBLIC)) {
  cpSync(PUBLIC, DIST, { recursive: true });
}

function findAsset(dir, predicate, prefix = "") {
  if (!existsSync(dir)) return "";
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findAsset(abs, predicate, rel);
      if (nested) return nested;
    } else if (predicate(entry.name)) {
      return rel;
    }
  }
  return "";
}

const assetsDir = join(DIST, "assets");
const cssFile = findAsset(assetsDir, (name) => name.endsWith(".css"));
const jsFile = findAsset(assetsDir, (name) => name.endsWith(".js"));

console.log(`[prepare-dist] Found production bundles: CSS=${cssFile || "none"}, JS=${jsFile || "none"}`);

// A static fallback without the client entry produces a page that looks healthy
// but cannot route, sign in, or hydrate. Fail the build instead of publishing it.
if (!jsFile) {
  throw new Error("[prepare-dist] No production JavaScript client entry found; refusing to publish a non-interactive shell");
}

let htmlContent = "";
try {
  const res = await fetch("http://127.0.0.1:3000/", { signal: AbortSignal.timeout(2000) });
  if (res.ok) {
    let rawHtml = await res.text();
    rawHtml = rawHtml.replace(
      /<link rel="stylesheet" href="\/src\/styles\.css"[^>]*\/>/i,
      cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}">` : ""
    );
    rawHtml = rawHtml.replace(
      /<link rel="stylesheet" href="\/@tanstack-start\/styles\.css[^>]*\/>/i,
      ""
    );
    rawHtml = rawHtml.replace(
      /<link rel="modulepreload" href="\/@id\/virtual:tanstack-start-dev-client-entry"[^>]*\/>/i,
      `<link rel="modulepreload" href="/assets/${jsFile}">`
    );
    rawHtml = rawHtml.replace(
      /<script type="module" async="" src="\/@id\/virtual:tanstack-start-dev-client-entry"><\/script>/i,
      `<script type="module" src="/assets/${jsFile}"></script>`
    );
    htmlContent = rawHtml;
  }
} catch {
  // Build-time dev server is normally absent. Use a hydrated SPA fallback below.
}

if (!htmlContent) {
  htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Crayons Bridge</title>
    <meta name="theme-color" content="#0b0a09" />
    <meta name="description" content="Crayons Bridge — title record, rights, and licensing OS. StreamVista OPC Pvt Ltd." />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}">` : ""}
    <link rel="modulepreload" href="/assets/${jsFile}">
  </head>
  <body class="bg-bg text-fg antialiased">
    <div id="root"></div>
    <script type="module" src="/assets/${jsFile}"></script>
  </body>
</html>`;
}

writeFileSync(join(DIST, "index.html"), htmlContent, "utf8");
writeFileSync(join(DIST, "404.html"), htmlContent, "utf8");

const BUILD = join(ROOT, "build");
mkdirSync(BUILD, { recursive: true });
cpSync(DIST, BUILD, { recursive: true });

console.log("[prepare-dist] Published hydrated client fallback; non-interactive shell publishing is forbidden.");
