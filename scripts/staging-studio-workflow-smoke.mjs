#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";

const REQUIRED_PROJECT_REF = "jbymleftneggcgutlcqu";

function requireApprovedStaging() {
  if (process.env.BRIDGE_STAGING_PROJECT_REF !== REQUIRED_PROJECT_REF) {
    throw new Error(`Refusing to run: BRIDGE_STAGING_PROJECT_REF must equal ${REQUIRED_PROJECT_REF}.`);
  }
  if (process.env.BRIDGE_STAGING_WORKFLOW_FIXTURES_APPROVED !== "true") {
    throw new Error("Refusing to write fixtures: set BRIDGE_STAGING_WORKFLOW_FIXTURES_APPROVED=true only after the STAGING test gate is approved.");
  }
  const urlText = process.env.BRIDGE_STAGING_SUPABASE_URL;
  const connectionString = process.env.BRIDGE_STAGING_DATABASE_URL;
  if (!urlText || new URL(urlText).hostname !== `${REQUIRED_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing to run: BRIDGE_STAGING_SUPABASE_URL must point to the exact Testing project.");
  }
  if (!connectionString) throw new Error("Set BRIDGE_STAGING_DATABASE_URL to the Testing-only Postgres connection string.");
  const databaseUrl = new URL(connectionString);
  const direct = databaseUrl.hostname === `db.${REQUIRED_PROJECT_REF}.supabase.co`;
  const pooler = databaseUrl.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(databaseUrl.username).includes(REQUIRED_PROJECT_REF);
  if (!direct && !pooler) {
    throw new Error("Refusing to run: database host/user does not prove the exact Testing project. Production and unrecognized hosts are blocked.");
  }
  return connectionString;
}

async function main() {
  const client = new Client({
    connectionString: requireApprovedStaging(),
    ssl: { rejectUnauthorized: true },
    application_name: "bridge-staging-studio-workflow-smoke-rollback",
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  let transactionOpen = false;
  try {
    const required = await client.query(`
      select name, to_regclass('public.' || name) is not null as present
      from unnest(array[
        'bridge_profiles', 'bridge_organizations', 'bridge_organization_memberships',
        'bridge_studio_invites', 'bridge_studio_ownership_transfers', 'bridge_audit_logs'
      ]) as name
    `);
    const missing = required.rows.filter((row) => !row.present).map((row) => row.name);
    if (missing.length) throw new Error(`STAGING BLOCKED: missing required tables: ${missing.join(", ")}. No fixture writes started.`);

    const columns = await client.query(`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = any($1::text[])
    `, [[
      "bridge_profiles", "bridge_organizations", "bridge_organization_memberships",
      "bridge_studio_invites", "bridge_studio_ownership_transfers", "bridge_audit_logs",
    ]]);
    const found = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const expected = [
      "bridge_profiles.user_id", "bridge_profiles.email", "bridge_profiles.display_name",
      "bridge_profiles.account_type", "bridge_profiles.organization_id", "bridge_profiles.email_verified",
      "bridge_organizations.id", "bridge_organizations.legal_name", "bridge_organizations.normalized_name",
      "bridge_organizations.status", "bridge_organization_memberships.organization_id",
      "bridge_organization_memberships.user_id", "bridge_organization_memberships.membership_role",
      "bridge_organization_memberships.status", "bridge_studio_invites.organization_id",
      "bridge_studio_invites.email", "bridge_studio_invites.membership_role",
      "bridge_studio_invites.invited_by", "bridge_studio_invites.token_hash",
      "bridge_studio_invites.expires_at", "bridge_studio_invites.accepted_by",
      "bridge_studio_invites.accepted_at", "bridge_studio_invites.revoked_at",
      "bridge_studio_ownership_transfers.organization_id",
      "bridge_studio_ownership_transfers.current_owner_user_id",
      "bridge_studio_ownership_transfers.proposed_owner_user_id",
      "bridge_studio_ownership_transfers.status", "bridge_studio_ownership_transfers.reason",
      "bridge_studio_ownership_transfers.accepted_at", "bridge_studio_ownership_transfers.cancelled_at",
      "bridge_audit_logs.actor_user_id", "bridge_audit_logs.action",
      "bridge_audit_logs.entity_type", "bridge_audit_logs.entity_id", "bridge_audit_logs.metadata",
    ];
    const absent = expected.filter((column) => !found.has(column));
    if (absent.length) throw new Error(`STAGING BLOCKED: schema contract mismatch: ${absent.join(", ")}. No fixture writes started.`);

    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '3s'");

    const suffix = randomUUID().replaceAll("-", "");
    const orgId = randomUUID();
    const ownerId = `staging-studio-owner-${suffix}`;
    const adminId = `staging-studio-admin-${suffix}`;
    const outsiderId = `staging-studio-outsider-${suffix}`;
    const ownerEmail = `${ownerId}@example.invalid`;
    const adminEmail = `${adminId}@example.invalid`;
    const outsiderEmail = `${outsiderId}@example.invalid`;

    await client.query(`
      insert into public.bridge_profiles
        (user_id, email, display_name, account_type, organization_name, email_verified)
      values
        ($1, $2, 'Synthetic Studio Owner', 'studio', 'Synthetic Studio', true),
        ($3, $4, 'Synthetic Studio Admin', 'studio', 'Synthetic Studio', true),
        ($5, $6, 'Synthetic Outsider', 'studio', 'Other Studio', true)
    `, [ownerId, ownerEmail, adminId, adminEmail, outsiderId, outsiderEmail]);
    await client.query(`
      insert into public.bridge_organizations (id, legal_name, normalized_name, status)
      values ($1, $2, $3, 'active')
    `, [orgId, `Synthetic Studio ${suffix}`, `synthetic studio ${suffix}`]);
    await client.query(
      "update public.bridge_profiles set organization_id = $1 where user_id = any($2::text[])",
      [orgId, [ownerId, adminId]],
    );
    await client.query(`
      insert into public.bridge_organization_memberships
        (organization_id, user_id, membership_role, status)
      values ($1, $2, 'owner', 'active'), ($1, $3, 'admin', 'active')
    `, [orgId, ownerId, adminId]);

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const invite = await client.query(`
      insert into public.bridge_studio_invites
        (organization_id, email, membership_role, invited_by, token_hash, expires_at)
      values ($1, $2, 'producer', $3, $4, now() + interval '7 days')
      returning id::text as id
    `, [orgId, outsiderEmail, ownerId, tokenHash]);
    assert.notEqual(tokenHash, rawToken, "only a token hash is persisted");
    assert.equal((await client.query(
      "select id from public.bridge_studio_invites where token_hash = $1 and email = $2 and accepted_at is null and revoked_at is null and expires_at > now()",
      [tokenHash, ownerEmail],
    )).rowCount, 0, "a different verified email must not accept this invitation");
    const accepted = await client.query(`
      update public.bridge_studio_invites i
      set accepted_by = p.user_id, accepted_at = now()
      from public.bridge_profiles p
      where i.id = $1::uuid and i.token_hash = $2
        and lower(trim(i.email)) = lower(trim(p.email))
        and p.email_verified = true
        and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
      returning i.id
    `, [invite.rows[0].id, tokenHash]);
    assert.equal(accepted.rowCount, 1, "only the matching verified email can accept an unexpired invite");
    await client.query("update public.bridge_profiles set organization_id = $1 where user_id = $2 and email_verified = true", [orgId, outsiderId]);
    await client.query("insert into public.bridge_organization_memberships (organization_id, user_id, membership_role, status) values ($1, $2, 'producer', 'active')", [orgId, outsiderId]);
    const invitedMembership = await client.query("select membership_role, status from public.bridge_organization_memberships where organization_id = $1 and user_id = $2", [orgId, outsiderId]);
    assert.equal(invitedMembership.rows[0]?.membership_role, "producer", "accepted invitation must provision the invited Studio role");
    assert.equal(invitedMembership.rows[0]?.status, "active", "accepted invitation must activate the invited Studio membership");
    await client.query(`
      insert into public.bridge_audit_logs
        (actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, 'studio.invitation_accepted', 'bridge_studio_invite', $2, $3::jsonb)
    `, [adminId, invite.rows[0].id, JSON.stringify({ organizationId: orgId, synthetic: true })]);

    const transfer = await client.query(`
      insert into public.bridge_studio_ownership_transfers
        (organization_id, current_owner_user_id, proposed_owner_user_id, reason)
      values ($1, $2, $3, 'Synthetic rollback-only ownership transfer test')
      returning id::text as id
    `, [orgId, ownerId, adminId]);
    await client.query("update public.bridge_organization_memberships set membership_role = 'admin', updated_at = now() where organization_id = $1 and user_id = $2 and membership_role = 'owner' and status = 'active'", [orgId, ownerId]);
    await client.query("update public.bridge_organization_memberships set membership_role = 'owner', updated_at = now() where organization_id = $1 and user_id = $2 and membership_role = 'admin' and status = 'active'", [orgId, adminId]);
    await client.query("update public.bridge_studio_ownership_transfers set status = 'ACCEPTED', accepted_at = now() where id = $1::uuid and status = 'PENDING'", [transfer.rows[0].id]);
    await client.query(`
      insert into public.bridge_audit_logs
        (actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, 'studio.ownership_transfer_accepted', 'bridge_studio_ownership_transfer', $2, $3::jsonb)
    `, [adminId, transfer.rows[0].id, JSON.stringify({ organizationId: orgId, previousOwnerUserId: ownerId, newOwnerUserId: adminId, synthetic: true })]);

    const roles = await client.query(
      "select user_id, membership_role from public.bridge_organization_memberships where organization_id = $1 and user_id = any($2::text[]) order by user_id",
      [orgId, [ownerId, adminId]],
    );
    assert.deepEqual(
      Object.fromEntries(roles.rows.map((row) => [row.user_id, row.membership_role])),
      { [adminId]: "owner", [ownerId]: "admin" },
      "accepted transfer must atomically leave exactly one new owner and demote the prior owner",
    );
    const audit = await client.query(
      "select action from public.bridge_audit_logs where entity_id = any($1::text[]) order by action",
      [[invite.rows[0].id, transfer.rows[0].id]],
    );
    assert.deepEqual(
      audit.rows.map((row) => row.action).sort(),
      ["studio.invitation_accepted", "studio.ownership_transfer_accepted"].sort(),
      "both lifecycle changes must leave audit evidence in the same transaction",
    );

    await client.query("ROLLBACK");
    transactionOpen = false;
    console.log("PASS: STAGING schema contract supports email-bound, expiring Studio invitation acceptance.");
    console.log("PASS: synthetic owner/admin handover leaves one owner and writes matching audit evidence.");
    console.log("PASS: all synthetic rows were rolled back; no real member, email, invitation or ownership changed.");
    console.log("LIMITATION: database lifecycle smoke only; authenticated server-action/browser E2E remains NOT VERIFIED.");
  } finally {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original error. */ }
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
