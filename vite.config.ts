import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
import { isMigrationFile } from "./scripts/migration-plan.mjs";

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

// Authentication is owned exclusively by Supabase Auth. Legacy Better Auth
// popup middleware was retired; auth callbacks are handled by the Supabase flow.

// `0.0.0.0:3000` is the preview contract.
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    // Keep the production build warning threshold explicit; this does not split chunks.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" ||
          warning.message?.includes("MODULE_LEVEL_DIRECTIVE") ||
          warning.message?.includes('directive "use client"')
        ) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
    alias: {
      "#tanstack-start-entry": join(process.cwd(), "src/start.ts"),
      "#tanstack-router-entry": join(process.cwd(), "src/router.tsx"),
    },
  },
  plugins: [
    pgliteBootstrapPlugin(),
    // Dev-only /__app-env, read by scripts/check-auth-invariant.mjs.
    appEnvPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            rolldownConfig: {
              onLog(level: string, log: any, defaultHandler: any) {
                if (
                  log?.code === "MODULE_LEVEL_DIRECTIVE" ||
                  log?.code === "EVAL" ||
                  log?.message?.includes("MODULE_LEVEL_DIRECTIVE") ||
                  log?.message?.includes("Use of direct `eval`")
                ) {
                  return false;
                }
                if (typeof defaultHandler === "function") {
                  defaultHandler(level, log);
                }
              },
              onwarn(warning: any, defaultHandler: any) {
                if (
                  warning?.code === "MODULE_LEVEL_DIRECTIVE" ||
                  warning?.code === "EVAL" ||
                  warning?.message?.includes("MODULE_LEVEL_DIRECTIVE") ||
                  warning?.message?.includes("Use of direct `eval`")
                ) {
                  return;
                }
                if (typeof defaultHandler === "function") {
                  defaultHandler(warning);
                }
              },
            },
            rollupConfig: {
              onwarn(warning: any, defaultHandler: any) {
                if (
                  warning?.code === "MODULE_LEVEL_DIRECTIVE" ||
                  warning?.code === "EVAL" ||
                  warning?.message?.includes("MODULE_LEVEL_DIRECTIVE") ||
                  warning?.message?.includes("Use of direct `eval`")
                ) {
                  return;
                }
                if (typeof defaultHandler === "function") {
                  defaultHandler(warning);
                }
              },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
