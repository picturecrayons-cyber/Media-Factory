import { createHmac } from "node:crypto";

export function assertLoopHandoffReady(input: { url?: string; secret?: string }) {
  const url = input.url?.trim() ?? "";
  const secret = input.secret?.trim() ?? "";
  if (!url || !secret) {
    throw new Error(
      "Loop ingest is unset. Title stays private on Bridge. Bind LOOP_HANDOFF_URL and LOOP_HANDOFF_SECRET on Vercel Preview.",
    );
  }
  if (!url.startsWith("https://")) {
    throw new Error("Loop ingest URL must be https");
  }
  return { url, secret };
}

export function signLoopHandoffBody(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export type LoopHandoffPayload = {
  source: "crayons-bridge";
  titleId: string;
  slug: string;
  name: string;
  language: string;
  year: number | null;
  masterKey: string;
  downloadUrl: string;
  expiresAt: string;
};

export function loopHandoffBody(payload: LoopHandoffPayload) {
  return JSON.stringify(payload);
}
