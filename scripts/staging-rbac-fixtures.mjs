import { randomUUID } from "node:crypto";

/**
 * Creates synthetic, non-production Bridge RBAC records inside the caller's
 * transaction. The caller MUST roll the transaction back.
 *
 * Never call this against Production. The staging smoke test enforces the
 * project ref and database hostname before importing this fixture.
 */
export async function seedStagingRbacFixtures(client) {
  const suffix = randomUUID().replaceAll("-", "");
  const studioA = randomUUID();
  const studioB = randomUUID();
  const ownerId = `staging-rbac-owner-${suffix}`;
  const memberAId = `staging-rbac-member-a-${suffix}`;
  const memberBId = `staging-rbac-member-b-${suffix}`;
  const titleAId = `staging-rbac-title-a-${suffix}`;
  const titleBId = `staging-rbac-title-b-${suffix}`;
  const assetAId = `staging-rbac-asset-a-${suffix}`;
  const assetBId = `staging-rbac-asset-b-${suffix}`;
  const sourceA = `staging-rbac/${suffix}/studio-a/master-a.mp4`;
  const sourceB = `staging-rbac/${suffix}/studio-b/master-b.mp4`;

  await client.query(
    `insert into public.bridge_profiles
      (user_id, email, display_name, account_type, organization_name, email_verified)
     values
      ($1, $2, 'Staging RBAC Owner', 'studio', 'Staging RBAC Studio A', true),
      ($3, $4, 'Staging RBAC Member A', 'studio', 'Staging RBAC Studio A', true),
      ($5, $6, 'Staging RBAC Member B', 'studio', 'Staging RBAC Studio B', true)`,
    [
      ownerId, `${ownerId}@example.invalid`,
      memberAId, `${memberAId}@example.invalid`,
      memberBId, `${memberBId}@example.invalid`,
    ],
  );

  await client.query(
    `insert into public.bridge_organizations (id, legal_name, normalized_name, status)
     values ($1, $2, $3, 'active'), ($4, $5, $6, 'active')`,
    [studioA, `Staging RBAC Studio A ${suffix}`, `staging rbac studio a ${suffix}`,
     studioB, `Staging RBAC Studio B ${suffix}`, `staging rbac studio b ${suffix}`],
  );

  await client.query(
    `update public.bridge_profiles set organization_id = $1
     where user_id = any($2::text[])`,
    [studioA, [ownerId, memberAId]],
  );
  await client.query(
    `update public.bridge_profiles set organization_id = $1 where user_id = $2`,
    [studioB, memberBId],
  );

  await client.query(
    `insert into public.bridge_organization_memberships
      (organization_id, user_id, membership_role, status)
     values
      ($1, $2, 'owner', 'active'),
      ($1, $3, 'member', 'active'),
      ($4, $5, 'member', 'active')`,
    [studioA, ownerId, memberAId, studioB, memberBId],
  );

  await client.query(
    `insert into public.bridge_titles
      (id, slug, name, owner_user_id, owner_account_type, owner_organization_id, status)
     values
      ($1, $2, 'Synthetic staging title A', $3, 'studio', $4, 'PREPARING'),
      ($5, $6, 'Synthetic staging title B', $3, 'studio', $4, 'PREPARING')`,
    [titleAId, `staging-rbac-a-${suffix}`, ownerId, studioA,
     titleBId, `staging-rbac-b-${suffix}`],
  );

  await client.query(
    `insert into public.bridge_assets
      (id, title_id, kind, s3_key, content_type, created_by)
     values
      ($1, $2, 'master', $3, 'video/mp4', $4),
      ($5, $6, 'master', $7, 'video/mp4', $8)`,
    [assetAId, titleAId, sourceA, memberAId,
     assetBId, titleBId, sourceB, memberBId],
  );

  return {
    studioA,
    studioB,
    ownerId,
    memberAId,
    memberBId,
    titleAId,
    titleBId,
    assetAId,
    assetBId,
    sourceA,
    sourceB,
    suffix,
  };
}
