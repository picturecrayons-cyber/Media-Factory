import { CANONICAL_SUPABASE_REF } from "./canonical.ts";

export const PREVIEW_STAGING_SUPABASE_REF = "jbymleftneggcgutlcqu";
export const PREVIEW_PRODUCTION_SUPABASE_REF = CANONICAL_SUPABASE_REF;

export type PreviewDiagnosticConfig = {
  vercelEnv?: string;
  commitSha?: string;
  supabaseUrl?: string;
  databaseUrl?: string;
};

export type PreviewDiagnosticTarget = {
  deploymentSha: string | null;
  environment: "preview";
  stagingProjectRef: string;
  databaseTargetIsStaging: boolean;
  productionTargetIsExcluded: boolean;
};

function projectRefFromSupabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Identify only the supported Supabase Postgres endpoint forms.
 * Direct DB host: db.<project-ref>.supabase.co / user postgres.
 * Transaction pooler: *.pooler.supabase.com / user postgres.<project-ref>.
 * The username and hostname are inspected only in memory and are never returned.
 */
export function supabaseDatabaseProjectRef(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return null;
    const username = decodeURIComponent(url.username);
    const direct = url.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i);
    if (direct && username === "postgres") return direct[1];
    if (/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/i.test(url.hostname)) {
      const pooled = username.match(/^postgres\.([a-z0-9]{20})$/i);
      return pooled?.[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolvePreviewDiagnosticTarget(
  config: PreviewDiagnosticConfig,
): PreviewDiagnosticTarget | null {
  if (config.vercelEnv !== "preview") return null;
  const sha = config.commitSha?.trim() ?? "";
  const deploymentSha = /^[a-f0-9]{40}$/i.test(sha) ? sha : null;
  const supabaseRef = projectRefFromSupabaseUrl(config.supabaseUrl);
  const databaseRef = supabaseDatabaseProjectRef(config.databaseUrl);
  const databaseTargetIsStaging =
    supabaseRef === PREVIEW_STAGING_SUPABASE_REF &&
    databaseRef === PREVIEW_STAGING_SUPABASE_REF;
  const productionTargetIsExcluded =
    supabaseRef !== PREVIEW_PRODUCTION_SUPABASE_REF &&
    databaseRef !== PREVIEW_PRODUCTION_SUPABASE_REF;

  return {
    deploymentSha,
    environment: "preview",
    stagingProjectRef: PREVIEW_STAGING_SUPABASE_REF,
    databaseTargetIsStaging,
    productionTargetIsExcluded,
  };
}
