import { randomUUID } from "node:crypto";
import { resolveServerSupabaseUrl, getSanitizedSupabaseProjectRef } from "./supabase-config.server";

/**
 * Emit one safe correlation record for an authenticated server-function request.
 * Never include bearer tokens, cookies, user identifiers, keys, or full URLs.
 */
export function logSupabaseBindingTrace(): string {
  const requestId = randomUUID();
  const deploymentSha =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    "unknown";
  let projectRef = "unconfigured";
  try {
    projectRef = getSanitizedSupabaseProjectRef(resolveServerSupabaseUrl());
  } catch {
    projectRef = "conflicting-or-invalid";
  }
  console.info(JSON.stringify({
    event: "supabase_binding_trace",
    requestId,
    deploymentSha,
    supabaseProjectRef: projectRef,
  }));
  return requestId;
}
