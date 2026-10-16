#!/usr/bin/env node
// Add Vercel Deployment Protection bypass only to requests targeting the explicitly
// configured deployment URL. Never forward this header to OCI or another host.
const rawPreviewUrl = process.env.BRIDGE_PREVIEW_URL?.trim();
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
if (!rawPreviewUrl) throw new Error("BRIDGE_PREVIEW_URL is required.");
if (!bypass) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required; no E2E was executed.");
const preview = new URL(rawPreviewUrl);
if (preview.protocol !== "https:" || !preview.hostname.endsWith(".vercel.app") ||
    preview.pathname !== "/" || preview.search || preview.hash) {
  throw new Error("Preview bypass wrapper accepts only an HTTPS deployment-specific *.vercel.app origin.");
}
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init = {}) => {
  const requestUrl = input instanceof Request ? input.url : String(input);
  const target = new URL(requestUrl, preview.origin);
  if (target.origin !== preview.origin) return originalFetch(input, init);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  headers.set("x-vercel-protection-bypass", bypass);
  return originalFetch(input, { ...init, headers });
};
await import("./oci-preview-authorization-e2e.mjs");
