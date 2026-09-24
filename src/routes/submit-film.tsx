import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/submit-film")({
  component: SubmitFilmEntry,
});

function SubmitFilmEntry() {
  return <Navigate to="/creator" replace />;
}
