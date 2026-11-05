import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, dbSource } from "@/lib/db";
import { assertNotDevUser } from "@/lib/bridge/guards";
import { canAccessDashboard } from "@/lib/bridge/rbac";
import { requireVerifiedActor } from "@/lib/bridge/session";
import { resolveCanonicalSupabaseUrl } from "@/lib/supabase-url";

type IdentityRow = {
  database_name: string;
  current_role: string;
  session_role: string;
  server_version: string;
  transaction_read_only: string;
};

function projectRefFromSupabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function projectRefFromDatabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const directHost = url.hostname.toLowerCase().match(/^db\.([a-z0-9]{20})\.supabase\.co$/);
    if (directHost?.[1]) return directHost[1];

    // Supabase session/transaction pooler usernames use postgres.<project-ref>.
    const username = decodeURIComponent(url.username);
    const pooledRef = username.match(/^[^.]+\.([a-z0-9]{20})$/);
    return pooledRef?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Read-only identity probe for Preview diagnosis.
 * Restricted to the existing verified Super Admin role; never returns secrets,
 * connection strings, user data, or environment-variable values.
 */
export const getPreviewDatabaseIdentity = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (!canAccessDashboard(actor)) throw new Error("Forbidden");

    if (dbSource !== "postgres") {
      throw new Error("PostgreSQL is not configured for this Preview deployment.");
    }

    const databaseUrl =
      process.env.DATABASE_URL ??
      process.env.POSTGRES_URL ??
      process.env.SUPABASE_DB_URL ??
      process.env.SUPABASE_DATABASE_URL;

    const authUrl = resolveCanonicalSupabaseUrl(
      process.env.VITE_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );

    const sql = await getSql();
    const rows = await sql<IdentityRow>`
      select
        current_database() as database_name,
        current_user as current_role,
        session_user as session_role,
        split_part(version(), ' ', 2) as server_version,
        current_setting('transaction_read_only') as transaction_read_only
    `;
    const row = rows[0];
    if (!row) throw new Error("Database identity query returned no result.");

    const authProjectRef = projectRefFromSupabaseUrl(authUrl);
    const databaseProjectRef = projectRefFromDatabaseUrl(databaseUrl);

    return {
      environment: "preview",
      dbSource,
      databaseName: row.database_name,
      currentRole: row.current_role,
      sessionRole: row.session_role,
      serverVersion: row.server_version,
      transactionReadOnly: row.transaction_read_only === "on",
      authProjectRef,
      databaseProjectRef,
      projectIdentityMatch:
        authProjectRef && databaseProjectRef
          ? authProjectRef === databaseProjectRef
          : null,
      checkedAt: new Date().toISOString(),
    };
  });
