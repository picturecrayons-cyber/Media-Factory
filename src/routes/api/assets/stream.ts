import { createFileRoute } from "@tanstack/react-router";
import { streamAssetWithToken } from "@/lib/bridge/assets";

export const Route = createFileRoute("/api/assets/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token") ?? "";
        return streamAssetWithToken(token, request.headers.get("range"));
      },
    },
  },
});
