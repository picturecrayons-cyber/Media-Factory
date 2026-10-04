import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertPermission } from "./rbac";
import { assertNotDevUser } from "./guards";

export const DESTINATION_TYPES = [
  "OTT",
  "YOUTUBE",
  "FAST",
  "TV",
  "AIRLINE",
  "HOTEL",
  "FESTIVAL",
  "DISTRIBUTOR",
  "INSTITUTIONAL",
] as const;

export type DestinationType = (typeof DESTINATION_TYPES)[number];
export type DestinationOwnership = "FIRST_PARTY" | "PARTNER";

// JSONB values must remain serializable across the server-function boundary.
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export type BridgeDestination = {
  id: string;
  code: string;
  name: string;
  destinationType: DestinationType;
  ownership: DestinationOwnership;
  monetizationModels: string[];
  territories: string[];
  languages: string[];
  deliveryRequirements: JsonObject;
  technicalSpecs: JsonObject;
  status: string;
};

type DestinationRow = {
  id: string;
  code: string;
  name: string;
  destination_type: DestinationType;
  ownership: DestinationOwnership;
  monetization_models: string[];
  territories: string[];
  languages: string[];
  delivery_requirements: JsonObject;
  technical_specs: JsonObject;
  status: string;
};

function mapDestination(row: DestinationRow): BridgeDestination {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    destinationType: row.destination_type,
    ownership: row.ownership,
    monetizationModels: row.monetization_models ?? [],
    territories: row.territories ?? [],
    languages: row.languages ?? [],
    deliveryRequirements: row.delivery_requirements ?? {},
    technicalSpecs: row.technical_specs ?? {},
    status: row.status,
  };
}

export const listDestinations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    assertPermission(actor, "title.read_catalog");
    const sql = await getSql();
    const rows = await sql<DestinationRow>`
      select id, code, name, destination_type, ownership, monetization_models,
             territories, languages, delivery_requirements, technical_specs, status
      from bridge_destinations
      order by case when ownership = 'FIRST_PARTY' then 0 else 1 end, name asc
    `;
    return { destinations: rows.map(mapDestination) };
  });
