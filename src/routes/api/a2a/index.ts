import { createFileRoute } from "@tanstack/react-router";
import { A2A_SKILLS, getA2ASkill } from "@/lib/a2a/registry";

export const Route = createFileRoute("/api/a2a/")({
  server: {
    handlers: {
      GET: async () => Response.json({ name: "Crayons Bridge Business Intelligence", version: "1.0.0", skills: A2A_SKILLS }),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { skill?: unknown } | null;
        const skillId = typeof body?.skill === "string" ? body.skill : "";
        const skill = getA2ASkill(skillId);
        if (!skill) return Response.json({ error: "Unknown skill", available_skills: A2A_SKILLS.map((item) => item.id) }, { status: 400 });
        return Response.json({ status: "accepted", skill, execution: "read_only_foundation", message: "Skill contract is registered. Business data execution requires an approved server-side adapter." });
      },
    },
  },
});
