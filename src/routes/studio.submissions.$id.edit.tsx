import { createFileRoute, redirect } from "@tanstack/react-router";

/** Canonical Studio resume URL; title workspace owns the edit/upload state. */
export const Route = createFileRoute("/studio/submissions/$id/edit")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/title/$id", params: { id: params.id } });
  },
});
