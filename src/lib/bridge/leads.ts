import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";

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
