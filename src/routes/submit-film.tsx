import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/submit-film" as any)({
  component: SubmitFilmEntry,
});

function SubmitFilmEntry() {
  return <Navigate to="/creator" replace />;
}
