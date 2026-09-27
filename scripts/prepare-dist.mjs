#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const STATIC = join(ROOT, ".vercel/output/static");
const PUBLIC = join(ROOT, "public");

console.log("[prepare-dist] Preparing build artifacts in dist/...");

// 1. Ensure dist directory exists
mkdirSync(DIST, { recursive: true });

// 2. Copy static outputs from .vercel/output/static if present
if (existsSync(STATIC)) {
  cpSync(STATIC, DIST, { recursive: true });
}

// 3. Ensure public assets are also directly in dist
if (existsSync(PUBLIC)) {
  cpSync(PUBLIC, DIST, { recursive: true });
}

// 4. Discover production CSS and JS entrypoints
const assetsDir = join(DIST, "assets");
const assets = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
const cssFile = assets.find((f) => f.startsWith("styles-") && f.endsWith(".css")) || "";
const jsFile = assets.find((f) => f.startsWith("index-") && f.endsWith(".js")) || "";

console.log(`[prepare-dist] Found production bundles: CSS=${cssFile || "none"}, JS=${jsFile || "none"}`);

// 5. Generate or fetch prerendered HTML
let htmlContent = "";

try {
  const res = await fetch("http://127.0.0.1:3000/", { signal: AbortSignal.timeout(2000) });
  if (res.ok) {
    let rawHtml = await res.text();
    // Replace dev styles and virtual entries with production asset links
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
      jsFile ? `<link rel="modulepreload" href="/assets/${jsFile}">` : ""
    );
    rawHtml = rawHtml.replace(
      /<script type="module" async="" src="\/@id\/virtual:tanstack-start-dev-client-entry"><\/script>/i,
      jsFile ? `<script type="module" src="/assets/${jsFile}"></script>` : ""
    );
    htmlContent = rawHtml;
    console.log("[prepare-dist] Prerendered HTML captured from running dev server");
  }
} catch {
  // Dev server not reachable, use clean fallback template
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
    <link rel="manifest" href="/__grok/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/__grok/icon-180.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" />
    ${cssFile ? `<link rel="stylesheet" href="/assets/${cssFile}">` : ""}
    ${jsFile ? `<link rel="modulepreload" href="/assets/${jsFile}">` : ""}
  </head>
  <body class="bg-bg text-fg antialiased">
    <div id="root">
      <div style="min-height: 100vh; background: #0b0a09; color: #f4ede4; display: flex; align-items: center; justify-content: center; font-family: sans-serif;">
        <div style="text-align: center;">
          <h1 style="font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem;">Crayons Bridge</h1>
          <p style="color: #9c9184;">One bridge from content to market.</p>
        </div>
      </div>
    </div>
    ${jsFile ? `<script type="module" src="/assets/${jsFile}"></script>` : ""}
  </body>
</html>`;
}

// Write index.html and 404.html (for SPA client-side routing fallback)
writeFileSync(join(DIST, "index.html"), htmlContent, "utf8");
writeFileSync(join(DIST, "404.html"), htmlContent, "utf8");

console.log("[prepare-dist] Successfully populated dist/ with production build artifacts!");
