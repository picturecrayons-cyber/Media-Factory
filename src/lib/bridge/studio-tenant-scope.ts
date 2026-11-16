/**
 * Canonical server-side Studio tenant-scope queries.
 *
 * The application and the disposable PostgreSQL isolation test both call these
 * functions, so CI exercises the same membership predicates as production.
 */
export interface BridgeTenantQueryClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export type BridgeTenantActor = {
  userId: string;
  organizationId?: string | null;
};

export async function resolveActiveOrganizationForUser(
  sql: BridgeTenantQueryClient,
  userId: string,
): Promise<string | null> {
  const rows = await sql.query<{ organization_id: string }>(
    `select bp.organization_id
     from bridge_profiles bp
     join bridge_organization_memberships m
       on m.organization_id = bp.organization_id
      and m.user_id = bp.user_id
      and m.status = 'active'
     join bridge_organizations o
       on o.id = m.organization_id
      and o.status = 'active'
     where bp.user_id = $1
       and bp.organization_id is not null
     limit 1`,
    [userId],
  );
  return rows[0]?.organization_id ?? null;
}

export async function listOwnedBridgeTitles<T = Record<string, unknown>>(
  sql: BridgeTenantQueryClient,
  actor: BridgeTenantActor,
  mergeColumnAvailable: boolean,
): Promise<T[]> {
  const mergedFilter = mergeColumnAvailable ? "and t.merged_into_title_id is null" : "";
  if (!actor.organizationId) {
    return sql.query<T>(
      `select t.*
       from bridge_titles t
       where t.owner_user_id = $1
       ${mergedFilter}
       order by t.updated_at desc
       limit 200`,
      [actor.userId],
    );
  }

  return sql.query<T>(
    `select t.*
     from bridge_titles t
     where (
       t.owner_user_id = $1
       or (
         t.owner_account_type = 'studio'
         and t.owner_organization_id = $2::uuid
         and exists (
           select 1
           from bridge_organization_memberships m
           where m.organization_id = $2::uuid
             and m.user_id = $1
             and m.status = 'active'
         )
       )
     )
     ${mergedFilter}
     order by t.updated_at desc
     limit 200`,
    [actor.userId, actor.organizationId],
  );
}

export async function listMyStoryConceptRows<T = Record<string, unknown>>(
  sql: BridgeTenantQueryClient,
  actor: BridgeTenantActor,
): Promise<T[]> {
  return sql.query<T>(
    `select c.*, t.name as title_name
     from bridge_story_concept_submissions c
     join bridge_titles t on t.id = c.title_id
     where t.owner_user_id = $1
        or (
          t.owner_account_type = 'studio'
          and t.owner_organization_id is not null
          and t.owner_organization_id = $2::uuid
          and exists (
            select 1
            from bridge_organization_memberships m
            where m.organization_id = t.owner_organization_id
              and m.user_id = $1
              and m.status = 'active'
          )
        )
     order by c.created_at desc
     limit 100`,
    [actor.userId, actor.organizationId ?? null],
  );
}
