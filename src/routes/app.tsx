import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "app | Crayons Bridge" }, { name: "robots", content: "noindex, nofollow" }] }),
   component: AppLegacyRedirect });

function AppLegacyRedirect() {
  return <Navigate to="/dashboard" replace />;
}
