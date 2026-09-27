import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({ component: AdminEntry });

function AdminEntry() {
  return <Navigate to="/internal" replace />;
}
