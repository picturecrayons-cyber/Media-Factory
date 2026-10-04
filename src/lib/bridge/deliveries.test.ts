import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../db.ts";
import type { Actor } from "./rbac.ts";
import { readDeliveryTraces } from "./delivery-traces.ts";

const packageA = "00000000-0000-0000-0000-000000000001";
const packageB = "00000000-0000-0000-0000-000000000002";
const packageOther = "00000000-0000-0000-0000-000000000003";
const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "creator-a",
  emailVerified: true,
  accountType: "independent_creator",
  internalRole: null,
  ...overrides,
});

async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated;
    create function bridge_can_read_title(text) returns boolean language sql as 'select true';
    create function bridge_current_internal_role() returns text language sql as 'select null::text';
    create function bridge_current_user_id() returns text language sql as 'select null::text';
    create table bridge_titles (
      id text primary key, name text, language text, year integer,
      owner_user_id text, updated_at timestamptz default now()
    );
    create table bridge_profiles (user_id text, organization_name text, display_name text);
    create table bridge_rights_grants (
      id uuid primary key, territories jsonb, languages jsonb, media jsonb,
      window_start timestamptz, window_end timestamptz
    );
    create table bridge_destination_packages (
      id uuid primary key, title_id text references bridge_titles(id) on delete cascade,
      destination text, readiness_state text, rights_grant_id uuid,
      created_at timestamptz default now()
    );
    create table bridge_buyer_title_access (
      title_id text, buyer_user_id text, revoked_at timestamptz, expires_at timestamptz
    );
  `);
  await pg.exec(
    await readFile(
      new URL("../../../migrations/0015_delivery_trace_finance.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.exec(`
    insert into bridge_titles(id,name,language,year,owner_user_id) values
      ('a','Title A','Malayalam',2026,'creator-a'),
      ('b','Title B','Malayalam',2026,'studio-b');
    insert into bridge_destination_packages(id,title_id,destination,readiness_state) values
      ('${packageA}','a','Buyer A','READY'),
      ('${packageB}','a','Buyer B','HOLD'),
      ('${packageOther}','b','Buyer B','READY');
    insert into bridge_buyer_title_access values
      ('a','buyer-a',null,null),
      ('a','revoked-buyer',now(),null),
      ('a','expired-buyer',null,now() - interval '1 day');
    insert into bridge_title_settlements(title_id,destination_package_id,status,created_by) values
      ('a','${packageA}','SETTLED','finance'),
      ('b','${packageOther}','ON_HOLD','finance');
    insert into bridge_title_investors(title_id,investor_name,created_by)
      values ('a','Investor A','finance');
  `);
  const sql = (async <T>(strings: TemplateStringsArray, ...values: unknown[]) => {
    let query = strings[0];
    values.forEach((_, i) => {
      query += `$${i + 1}${strings[i + 1]}`;
    });
    return (await pg.query<T>(query, values)).rows;
  }) as Sql;
  return { pg, sql };
}

describe("delivery trace authorization", () => {
  it("denies viewers, unverified actors and dev identity before acquiring SQL", async () => {
    for (const denied of [
      actor({ internalRole: "viewer" }),
      actor({ emailVerified: false }),
      actor({ userId: "dev-user" }),
    ]) {
      let acquired = false;
      await assert.rejects(
        readDeliveryTraces(denied, async () => {
          acquired = true;
          throw new Error("SQL must not be acquired");
        }),
        /Forbidden|verification|Mock\/dev/,
      );
      assert.equal(acquired, false);
    }
  });

  it("denies external buyers regardless of active, revoked, expired or absent title grants", async () => {
    const { pg, sql } = await fixture();
    try {
      for (const userId of ["buyer-a", "buyer-b", "revoked-buyer", "expired-buyer", "creator-a"]) {
        let acquired = false;
        await assert.rejects(
          readDeliveryTraces(actor({ userId, accountType: "buyer" }), async () => {
            acquired = true;
            return sql;
          }),
          /Forbidden/,
        );
        assert.equal(acquired, false);
      }
    } finally {
      await pg.close();
    }
  });

  it("returns delivery data but suppresses settlement payload for QC and legal roles", async () => {
    const { pg, sql } = await fixture();
    try {
      for (const internalRole of ["qc_reviewer", "legal_reviewer"] as const) {
        const { deliveries } = await readDeliveryTraces(actor({ internalRole }), async () => sql);
        assert.equal(deliveries.length, 2);
        assert.ok(deliveries.every((row) => row.settlementStatus === null));
        const title = deliveries.find((row) => row.titleId === "a")!;
        assert.deepEqual(title.destinations.map((d) => d.buyer).sort(), ["Buyer A", "Buyer B"]);
        assert.equal(title.investorCount, 1);
      }
    } finally {
      await pg.close();
    }
  });

  it("allows finance/admin roles and preserves internal-role precedence over account type", async () => {
    const { pg, sql } = await fixture();
    try {
      for (const internalRole of ["finance", "admin", "super_admin"] as const) {
        const { deliveries } = await readDeliveryTraces(
          actor({ internalRole, accountType: "buyer" }),
          async () => sql,
        );
        assert.equal(deliveries.find((row) => row.titleId === "a")?.settlementStatus, "SETTLED");
        assert.equal(deliveries.find((row) => row.titleId === "b")?.settlementStatus, "ON_HOLD");
      }
    } finally {
      await pg.close();
    }
  });

  it("scopes creator/studio delivery and finance traces to their own titles", async () => {
    const { pg, sql } = await fixture();
    try {
      for (const [userId, accountType, titleId, status] of [
        ["creator-a", "independent_creator", "a", "SETTLED"],
        ["studio-b", "studio", "b", "ON_HOLD"],
      ] as const) {
        const { deliveries } = await readDeliveryTraces(
          actor({ userId, accountType }),
          async () => sql,
        );
        assert.deepEqual(
          deliveries.map((row) => row.titleId),
          [titleId],
        );
        assert.equal(deliveries[0].settlementStatus, status);
      }
      assert.deepEqual(
        (await readDeliveryTraces(actor({ userId: "unrelated" }), async () => sql)).deliveries,
        [],
      );
    } finally {
      await pg.close();
    }
  });
});

describe("delivery settlement foreign keys", () => {
  it("rejects cross-title packages while allowing matching and null packages", async () => {
    const { pg } = await fixture();
    try {
      await assert.rejects(
        pg.query(
          "insert into bridge_title_settlements(title_id,destination_package_id,created_by) values ('a',$1,'finance')",
          [packageOther],
        ),
        /foreign key/,
      );
      await pg.query(
        "insert into bridge_title_settlements(title_id,destination_package_id,created_by) values ('a',$1,'finance'),('a',null,'finance')",
        [packageB],
      );
    } finally {
      await pg.close();
    }
  });

  it("clears only the package key on deletion and preserves settlement and title identity", async () => {
    const { pg } = await fixture();
    try {
      await pg.query("delete from bridge_destination_packages where id=$1", [packageA]);
      const { rows } = await pg.query<{
        title_id: string;
        destination_package_id: string | null;
        status: string;
      }>(
        "select title_id,destination_package_id,status from bridge_title_settlements where title_id='a'",
      );
      assert.deepEqual(rows, [{ title_id: "a", destination_package_id: null, status: "SETTLED" }]);
      await pg.exec("delete from bridge_titles where id='b'");
      assert.deepEqual(
        (await pg.query("select * from bridge_title_settlements where title_id='b'")).rows,
        [],
      );
    } finally {
      await pg.close();
    }
  });
});
