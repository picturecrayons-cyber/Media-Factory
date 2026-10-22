/**
 * Client-side diagnostics for failures that never reach Vercel function logs.
 * Deliberately local-only: no telemetry endpoint, auth headers, query strings,
 * cookies, request/response bodies, or user identifiers are collected.
 */
function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return raw
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|token|apikey|api_key|password|code)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]");
}

function recentSameOriginRequests(): Array<{ path: string; durationMs: number }> {
  if (typeof window === "undefined" || typeof performance === "undefined") return [];
  return performance.getEntriesByType("resource")
    .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
    .filter((entry) => {
      try {
        const url = new URL(entry.name);
        return url.origin === window.location.origin &&
          (url.pathname.includes("_serverFn") || url.pathname.startsWith("/api/"));
      } catch {
        return false;
      }
    })
    .slice(-8)
    .map((entry) => {
      const url = new URL(entry.name);
      return { path: url.pathname, durationMs: Math.round(entry.duration) };
    });
}

export function reportBridgeClientFailure(event: string, error: unknown): string {
  const diagnosticId = `BRIDGE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  if (typeof window !== "undefined") {
    console.error("[Bridge client diagnostic]", {
      diagnosticId,
      event,
      at: new Date().toISOString(),
      route: window.location.pathname,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: safeErrorMessage(error),
      recentSameOriginRequests: recentSameOriginRequests(),
      note: "Request HTTP status is not available from Resource Timing. Inspect DevTools Network for the first failed request.",
    });
  }
  return diagnosticId;
}
