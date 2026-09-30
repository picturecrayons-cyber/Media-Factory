import { createFileRoute, Navigate } from "@tanstack/react-router";

// Bridge governs publication; consumer merchandising belongs to Loop.
export const Route = createFileRoute("/loop-cms")({
  component: () => <Navigate to="/internal" replace />,
});
