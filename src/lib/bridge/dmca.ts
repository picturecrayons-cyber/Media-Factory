import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireActor } from "@/lib/bridge/session";

const dmcaRegistrationSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  companyName: z.string().trim().min(1).max(200),
  mpi: z.string().trim().max(200).optional().default(""),
});

type DmcaResponse = Record<string, unknown>;

function publicResult(payload: DmcaResponse, httpStatus: number) {
  const data = payload.data ?? payload.d ?? payload;
  const object = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    id: typeof object.id === "string" ? object.id : null,
    message:
      typeof object.message === "string"
        ? object.message
        : httpStatus >= 200 && httpStatus < 300
          ? "DMCA registration submitted."
          : "DMCA registration was not accepted.",
  };
}

export const registerDmcaAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(dmcaRegistrationSchema)
  .handler(async ({ data, context }) => {
    const actor = await requireActor(context.userId);

    // The DMCA account is created for the authenticated Bridge identity.
    // Do not trust a browser-supplied email for the external registration.
    const payload = {
      FirstName: data.firstName,
      LastName: data.lastName,
      Email: actor.email,
      CompanyName: data.companyName,
      mpi: data.mpi,
    };

    const response = await fetch("https://api.dmca.com/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let parsed: DmcaResponse = {};
    try {
      parsed = text ? (JSON.parse(text) as DmcaResponse) : {};
    } catch {
      parsed = {};
    }

    const result = publicResult(parsed, response.status);
    const sql = await getSql();

    await sql`
      insert into bridge_audit_logs (
        actor_user_id, action, entity_type, entity_id, metadata
      ) values (
        ${actor.userId},
        ${result.ok ? "dmca_registration_submitted" : "dmca_registration_failed"},
        "dmca_registration",
        ${result.id},
        ${JSON.stringify({
          email: actor.email,
          companyName: data.companyName,
          status: result.status,
        })}
      )
    `;

    if (!result.ok) {
      throw new Error(result.message);
    }

    return result;
  });
