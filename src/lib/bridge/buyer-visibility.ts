import { getSql } from "@/lib/db";

export type BuyerGateStatus = {
  qc: boolean; legal: boolean; ott: boolean; packaging: boolean; curation: boolean; delivery: boolean; publishable: boolean;
};

export async function getBuyerGateStatus(titleId: string): Promise<BuyerGateStatus> {
  const sql = await getSql();
  const rows = await sql<BuyerGateStatus>`
    select
      exists(select 1 from bridge_qc_cases q where q.title_id=${titleId} and q.status='PASSED'
        and q.reviewer_findings->0->'technicalEvidence'->>'playbackVerified'='true'
        and nullif(q.reviewer_findings->0->'technicalEvidence'->>'codec','') is not null
        and nullif(q.reviewer_findings->0->'technicalEvidence'->>'resolution','') is not null
        and nullif(q.reviewer_findings->0->'technicalEvidence'->>'frameRate','') is not null
        and q.reviewer_findings->0->'technicalEvidence'->>'audioVerified'='true'
        and nullif(q.reviewer_findings->0->'technicalEvidence'->>'audioDetails','') is not null
        and nullif(q.reviewer_findings->0->'technicalEvidence'->>'masterLanguage','') is not null
        and q.reviewer_findings->0->'technicalEvidence'->>'posterVerified'='true') as qc,
      exists(
        select 1
        from bridge_rights_grants rg
        join bridge_legal_cases l
          on l.title_id=rg.title_id and l.evidence->0->>'grantId'=rg.id::text
        where rg.title_id=${titleId} and rg.status='VALID'
          and rg.window_end>now() and l.status='APPROVED'
          and l.reviewed_by is not null and l.reviewed_at is not null
          and nullif(l.evidence->0->>'agreementReference','') is not null
          and nullif(l.evidence->0->>'ownershipReference','') is not null
          and l.evidence->0->>'reviewerConfirmedEvidence'='true'
      ) as legal,
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
