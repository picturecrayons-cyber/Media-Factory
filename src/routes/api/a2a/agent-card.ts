import { createFileRoute } from "@tanstack/react-router";
import { A2A_SKILLS } from "@/lib/a2a/registry";

export const Route = createFileRoute("/api/a2a/agent-card")({
  server: {
    handlers: {
      GET: async () => Response.json({ name: "Crayons Bridge Business Intelligence", version: "1.0.0", capabilities: { streaming: false, pushNotifications: false }, skills: A2A_SKILLS }),
    },
  },
});
