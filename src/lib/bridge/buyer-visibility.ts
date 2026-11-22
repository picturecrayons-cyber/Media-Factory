import { getSql } from "@/lib/db";

export type BuyerGateStatus = {
  qc: boolean; legal: boolean; ott: boolean; packaging: boolean; curation: boolean; delivery: boolean; publishable: boolean;
};

/**
 * Buyer catalogue access is individual, not organization-wide by inference.
 * Missing access schema fails closed: no Buyer title is exposed until the
 * explicit, revocable grant table is available and a live grant exists.
 */
export async function buyerHasExplicitTitleAccess(titleId: string, buyerUserId: string): Promise<boolean> {
  const sql = await getSql();
  const schema = await sql<{ available: boolean }>`select to_regclass('public.bridge_buyer_title_access') is not null as available`;
  if (!schema[0]?.available) return false;
  const rows = await sql<{ allowed: boolean }>`
    select exists (
      select 1
      from bridge_buyer_title_access
      where title_id = ${titleId}
        and buyer_user_id = ${buyerUserId}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    ) as allowed
  `;
  return Boolean(rows[0]?.allowed);
}

export async function getBuyerGateStatus(titleId: string): Promise<BuyerGateStatus> {
  const sql = await getSql();
  const rows = await sql<BuyerGateStatus>`
    select
      exists(select 1 from bridge_qc_cases q where q.title_id=${titleId} and q.status='PASSED') as qc,
      exists(select 1 from bridge_legal_cases l where l.title_id=${titleId} and l.status='APPROVED') as legal,
      exists(select 1 from bridge_title_gate_certifications g where g.title_id=${titleId} and g.ott_preparation_status='READY') as ott,
      exists(select 1 from bridge_title_gate_certifications g where g.title_id=${titleId} and g.packaging_status='COMPLETE') as packaging,
      exists(select 1 from bridge_title_gate_certifications g where g.title_id=${titleId} and g.curation_status='APPROVED') as curation,
      exists(select 1 from bridge_title_gate_certifications g where g.title_id=${titleId} and g.delivery_status='READY')
        and exists(select 1 from bridge_destination_packages p where p.title_id=${titleId} and p.readiness_state in ('READY','AUTHORIZED','DELIVERED')) as delivery,
      public.bridge_title_buyer_visibility(${titleId}) as publishable
  `;
  return rows[0] ?? {qc:false,legal:false,ott:false,packaging:false,curation:false,delivery:false,publishable:false};
}

export async function assertBuyerPublishable(titleId: string) {
  const sql = await getSql();
  await sql`select public.bridge_assert_buyer_publishable(${titleId})`;
}
