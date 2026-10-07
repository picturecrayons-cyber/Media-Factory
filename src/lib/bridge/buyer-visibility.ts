import { getSql } from "@/lib/db";

export type BuyerGateStatus = {
  qc: boolean; legal: boolean; ott: boolean; packaging: boolean; curation: boolean; delivery: boolean; publishable: boolean;
};

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
