const PROJECT_URLS = {
  preview: "https://jbymleftneggcgutlcqu.supabase.co",
  production: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
} as const;

type DeploymentTarget = "preview" | "production" | "local" | "test";

/**
 * Prevent a deployed Bridge runtime from silently connecting to the wrong
 * Supabase project. The target must be explicit in each Vercel environment.
 */
export function assertSupabaseProjectTarget(
  configuredUrl: string | undefined,
  configuredTarget: string | undefined,
  deployed: boolean,
): void {
  const url = configuredUrl?.trim().replace(/\\/+$/, "");
  const target = configuredTarget?.trim();

  if (!url) {
    if (deployed) throw new Error("CONFIG_MISSING: deployed Supabase URL is required.");
    return;
  }

  if (!target) {
    if (deployed) throw new Error("CONFIG_MISSING: VITE_SUPABASE_TARGET must be set to preview or production.");
    return;
  }

  if (!["preview", "production", "local", "test"].includes(target)) {
    throw new Error("CONFIG_MISSING: unsupported VITE_SUPABASE_TARGET.");
  }

  if (target === "preview" || target === "production") {
    const expected = PROJECT_URLS[target];
    if (url !== expected) {
      throw new Error(`CONFIG_MISSING: Bridge ${target} runtime is not bound to its canonical Supabase project.`);
    }
    return;
  }

  if (!/^http:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/.test(url)) {
    throw new Error("CONFIG_MISSING: local/test Bridge runtimes may connect only to localhost Supabase.");
  }
}
