import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";

export const createEnquiry = createServerFn({ method: "POST" })
  .validator(z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    organization: z.string().trim().max(120).optional(),
    message: z.string().trim().min(8).max(1000),
  }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql.query(`
      create table if not exists bridge_enquiries (
        id text primary key,
        name text not null,
        email text not null,
        organization text,
        message text not null,
        created_at timestamptz not null default now()
      )
    `);
    const id = randomBytes(16).toString("hex");
    await sql`
      insert into bridge_enquiries (id, name, email, organization, message)
      values (${id}, ${data.name}, ${data.email}, ${data.organization || null}, ${data.message})
    `;
    return { id };
  });

export const listEnquiries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const actor = await requireVerifiedActor(context.userId);
    if (actor.internalRole !== "admin" && actor.internalRole !== "super_admin") {
      throw new Error("Forbidden");
    }
    const sql = await getSql();
    await sql.query(`
      create table if not exists bridge_enquiries (
        id text primary key,
        name text not null,
        email text not null,
        organization text,
        message text not null,
        created_at timestamptz not null default now()
      )
    `);
    const rows = await sql<{ id: string; name: string; email: string; organization: string | null; message: string; created_at: string }>`
      select id, name, email, organization, message, created_at
      from bridge_enquiries
      order by created_at desc
      limit 50
    `;
    return { enquiries: rows };
  });
