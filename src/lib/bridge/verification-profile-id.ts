import type { BridgeActor } from "./session";

export function verificationProfileId(actor: BridgeActor | null): string {
  if (!actor) throw new Error("Bridge profile required");
  return actor.userId;
}
