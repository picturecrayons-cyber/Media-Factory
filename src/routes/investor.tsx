import { createFileRoute, Navigate } from "@tanstack/react-router";

// Investor participation records remain operational data, not a public Bridge account role.
// Keep a safe redirect for legacy bookmarks; this route must not expose investor records.
export const Route = createFileRoute("/investor")({
  component: () => <Navigate to="/" replace />,
});
