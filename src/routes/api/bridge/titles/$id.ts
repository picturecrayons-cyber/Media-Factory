import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/bridge/titles/$id")({
  server: {
    handlers: {
      DELETE: async () => Response.json(
        {
          error: "Permanent draft deletion is disabled. Use an approved archive and restore workflow instead.",
          code: "DRAFT_DELETE_DISABLED",
        },
        { status: 405 },
      ),
    },
  },
});
