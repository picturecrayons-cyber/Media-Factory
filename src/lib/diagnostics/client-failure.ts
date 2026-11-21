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

function safeStack(error: unknown): string | undefined {
  if (!(error instanceof Error) || typeof error.stack !== "string") return undefined;
  return error.stack
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|token|apikey|api_key|password|code)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
    .slice(0, 5000);
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
      errorStack: safeStack(error),
      recentSameOriginRequests: recentSameOriginRequests(),
      note: "Request HTTP status is not available from Resource Timing. Inspect DevTools Network for the first failed request.",
    });
  }
  return diagnosticId;
}

/**
 * Capture uncaught page errors locally so minified-bundle failures retain
 * their stack and source location. This intentionally sends no telemetry.
 */
export function reportBridgeWindowError(event: ErrorEvent): void {
  const sourcePath = (() => {
    try {
      return event.filename ? new URL(event.filename, window.location.href).pathname : undefined;
    } catch {
      return undefined;
    }
  })();
  console.error("[Bridge uncaught client error]", {
    at: new Date().toISOString(),
    route: window.location.pathname,
    errorName: event.error instanceof Error ? event.error.name : "UncaughtError",
    errorMessage: safeErrorMessage(event.message),
    errorStack: safeStack(event.error),
    sourcePath,
    line: event.lineno || undefined,
    column: event.colno || undefined,
    recentSameOriginRequests: recentSameOriginRequests(),
    note: "Local browser diagnostics only. Source URL query strings and request headers are intentionally excluded.",
  });
}
