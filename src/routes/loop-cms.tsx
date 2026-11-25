import { createFileRoute, Navigate } from "@tanstack/react-router";

// Bridge is the single operator CMS for Loop publication, rights and catalog controls.
// Keep this legacy entry point for existing Loop admin links, but land in the canonical CMS.
export const Route = createFileRoute("/loop-cms")({
  component: () => <Navigate to="/cms" replace />,
});
