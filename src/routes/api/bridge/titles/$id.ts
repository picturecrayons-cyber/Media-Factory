import { createFileRoute } from "@tanstack/react-router";
import { assertSameSiteRequest } from "@/lib/auth/isolation.server";
import { requireUser, UnauthorizedError } from "@/lib/auth/verify.server";
import { deleteDraftTitleForUser } from "@/lib/bridge/titles";

export const Route = createFileRoute("/api/bridge/titles/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          assertSameSiteRequest();
          const authorization = request.headers.get("authorization") ?? "";
          const bearerToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
          const user = await requireUser(bearerToken);
          const result = await deleteDraftTitleForUser(user.id, params.id);
          return Response.json(result);
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            return Response.json({ error: "Authentication required." }, { status: 401 });
          }
          const message = error instanceof Error ? error.message : "";
          if (message === "Forbidden") return Response.json({ error: "You cannot delete this draft." }, { status: 403 });
          if (message === "Not found") return Response.json({ error: "Draft not found." }, { status: 404 });
          if (message.includes("Only DRAFT") || message.includes("assets or upload") || message.includes("changed")) {
            return Response.json({ error: message }, { status: 409 });
          }
          console.error("[bridge] draft deletion failed", error);
          return Response.json({ error: "Draft deletion failed safely. No change was confirmed." }, { status: 500 });
        }
      },
    },
  },
});
