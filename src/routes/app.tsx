import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({ component: AppLegacyRedirect });

function AppLegacyRedirect() {
  return <Navigate to="/dashboard" replace />;
}
