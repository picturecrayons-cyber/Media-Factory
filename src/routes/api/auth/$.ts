import { createFileRoute } from "@tanstack/react-router";
import { authConfigResponse } from "@/lib/auth/auth-config-response";
import { bridgeEnv } from "@/lib/bridge/env";

function handler() {
  try {
    return authConfigResponse(bridgeEnv.supabaseUrl());
  } catch {
    return authConfigResponse(undefined);
  }
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
