import { createFileRoute, Navigate } from "@tanstack/react-router";

// Bridge governs publication; consumer merchandising belongs to Loop.
export const Route = createFileRoute("/loop-cms")({
  head: () => ({ meta: [{ title: "loop-cms | Crayons Bridge" }, { name: "robots", content: "noindex, nofollow" }] }),
  
  component: () => <Navigate to="/internal" replace />,
});
