import { createFileRoute } from "@tanstack/react-router";
import { getSql, dbSource } from "@/lib/db";
import { bridgeEnv } from "@/lib/bridge/env";
import { getDashboardSession } from "@/lib/bridge/session";
import { resolvePreviewDiagnosticTarget } from "@/lib/bridge/preview-diagnostic";

export const Route = createFileRoute("/api/internal/preview-diagnostic")({
  server: {
    handlers: {
      GET: async () => {
        // The existing server-side gate requires a verified super_admin profile
        // and enforces the application's same-site request policy.
        try {
          await getDashboardSession();
        } catch {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (process.env.VERCEL_ENV !== "preview") {
          return new Response(null, { status: 404 });
        }

        const target = resolvePreviewDiagnosticTarget({
          vercelEnv: process.env.VERCEL_ENV,
          commitSha: process.env.VERCEL_GIT_COMMIT_SHA,
          supabaseUrl: bridgeEnv.supabaseUrl(),
          // Match src/lib/db.ts nullish precedence exactly; a blank primary
          // binding must not silently fall through to a different target.
          databaseUrl:
            process.env.DATABASE_URL ??
            process.env.POSTGRES_URL ??
            process.env.SUPABASE_DB_URL ??
            process.env.SUPABASE_DATABASE_URL,
        });

        if (!target) return new Response(null, { status: 404 });

        let databaseCheck: "PASS" | "FAIL" | "NOT_VERIFIED" = "NOT_VERIFIED";
        if (
          target.deploymentSha &&
          target.databaseTargetIsStaging &&
          target.productionTargetIsExcluded &&
          dbSource === "postgres"
        ) {
          try {
            const sql = await getSql();
            const rows = await sql.query<{ ok: number }>("select 1 as ok");
            databaseCheck = rows.length === 1 && Number(rows[0]?.ok) === 1 ? "PASS" : "FAIL";
          } catch {
            databaseCheck = "FAIL";
          }
        }

        return Response.json({
          deploymentSha: target.deploymentSha,
          environment: target.environment,
          stagingProjectRef: target.stagingProjectRef,
          databaseCheck,
          productionTargetCheck: target.productionTargetIsExcluded ? "PASS" : "FAIL",
        });
      },
      POST: async () => new Response(null, { status: 405, headers: { Allow: "GET" } }),
    },
  },
});
