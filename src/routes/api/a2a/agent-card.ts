import { createFileRoute } from "@tanstack/react-router";
import { A2A_SKILLS } from "@/lib/a2a/registry";
import { DIT_AGENT_CARD } from "@/lib/a2a/dit-agent-card";

export const Route = createFileRoute("/api/a2a/agent-card")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const agent = new URL(request.url).searchParams.get("agent");
        if (agent === "dit") return Response.json(DIT_AGENT_CARD);
        return Response.json({
          name: "Crayons Bridge Business Intelligence",
          version: "1.0.0",
          capabilities: { streaming: false, pushNotifications: false },
          skills: A2A_SKILLS,
        });
      },
    },
  },
});
