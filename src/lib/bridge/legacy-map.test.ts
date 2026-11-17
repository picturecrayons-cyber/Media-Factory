import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapLegacyTitle, mapLegacyTitles } from "./legacy-map.ts";

describe("legacy title map", () => {
  it("always lands mapped titles in DRAFT", () => {
    const mapped = mapLegacyTitle({
      id: 9,
      title: "Koodal",
      title_ml: "കൂടൽ",
      status: "LIVE",
      year: "2024",
    });
    assert.equal(mapped.status, "DRAFT");
    assert.equal(mapped.name, "Koodal");
    assert.equal(mapped.nameMl, "കൂടൽ");
    assert.equal(mapped.year, 2024);
  });

  it("skips rows without id/name and reports the rest", () => {
    const { mapped, report } = mapLegacyTitles([
      { id: 1, name: "One" },
      { title: "missing-id" },
    ]);
    assert.equal(report.sourceCount, 2);
    assert.equal(report.mappedCount, 1);
    assert.equal(mapped[0].status, "DRAFT");
    assert.equal(report.skipped.length, 1);
  });
});


describe("legacy-link unresolved migration", () => {
  it("preserves suggested targets but removes them from active use until verified", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const db = new PGlite();
    try {
      await db.waitReady;
      await db.exec("create role anon; create role authenticated; create role service_role;");
      await db.exec(`
        create table public.bridge_titles (id text primary key);
        create table public.streamvista_orders (id uuid primary key);
        create table public.streamvista_legacy_links (
          source_table text not null,
          legacy_id text not null,
          order_id uuid,
          bridge_title_id text,
          review_status text not null default 'pending',
          reviewed_by text,
          reviewed_at timestamptz,
          resolution_status text not null default 'resolved',
          constraint streamvista_legacy_links_pkey primary key (source_table, legacy_id),
          constraint streamvista_legacy_links_resolution_status_check
            check (resolution_status in ('resolved','unresolved','rejected')),
          constraint streamvista_legacy_links_bridge_title_id_fkey
            foreign key (bridge_title_id) references public.bridge_titles(id) on delete restrict,
          constraint streamvista_legacy_links_order_id_fkey
            foreign key (order_id) references public.streamvista_orders(id) on delete restrict,
          constraint streamvista_link_target
            check (order_id is not null or bridge_title_id is not null)
        );
        insert into public.bridge_titles (id) values ('title-jananam'), ('title-koodal');
        insert into public.streamvista_orders (id)
        values ('00000000-0000-4000-8000-000000000001');
        insert into public.streamvista_legacy_links
          (source_table, legacy_id, bridge_title_id, review_status)
        values ('films_film', '7', 'title-jananam', 'pending');
        insert into public.streamvista_legacy_links
          (source_table, legacy_id, order_id, review_status, reviewed_by, reviewed_at)
        values (
          'films_payment', 'paid-1',
          '00000000-0000-4000-8000-000000000001',
          'verified', 'reviewer-1', now()
        );
        insert into public.streamvista_legacy_links
          (source_table, legacy_id, bridge_title_id, review_status)
        values ('films_film', 'rejected-1', 'title-koodal', 'rejected');
      `);

      const migration = readFileSync(
        join(process.cwd(), "supabase/migrations/20261116233444_streamvista_legacy_links_unresolved_resolution_state.sql"),
        "utf8",
      );
      await db.exec(migration);

      const pending = await db.query<{
        bridge_title_id: string | null;
        candidate_bridge_title_id: string | null;
        order_id: string | null;
        resolution_status: string;
        review_status: string;
      }>(`
        select bridge_title_id, candidate_bridge_title_id, order_id,
               resolution_status, review_status
        from public.streamvista_legacy_links
        where source_table='films_film' and legacy_id='7'
      `);
      assert.deepEqual(pending.rows[0], {
        bridge_title_id: null,
        candidate_bridge_title_id: "title-jananam",
        order_id: null,
        resolution_status: "unresolved",
        review_status: "pending",
      });

      const verified = await db.query<{
        bridge_title_id: string | null;
        candidate_bridge_title_id: string | null;
        order_id: string | null;
        resolution_status: string;
        review_status: string;
      }>(`
        select bridge_title_id, candidate_bridge_title_id, order_id,
               resolution_status, review_status
        from public.streamvista_legacy_links
        where source_table='films_payment' and legacy_id='paid-1'
      `);
      assert.deepEqual(verified.rows[0], {
        bridge_title_id: null,
        candidate_bridge_title_id: null,
        order_id: "00000000-0000-4000-8000-000000000001",
        resolution_status: "resolved",
        review_status: "verified",
      });

      const rejected = await db.query<{
        bridge_title_id: string | null;
        candidate_bridge_title_id: string | null;
        resolution_status: string;
        review_status: string;
      }>(`
        select bridge_title_id, candidate_bridge_title_id,
               resolution_status, review_status
        from public.streamvista_legacy_links
        where source_table='films_film' and legacy_id='rejected-1'
      `);
      assert.deepEqual(rejected.rows[0], {
        bridge_title_id: null,
        candidate_bridge_title_id: "title-koodal",
        resolution_status: "rejected",
        review_status: "rejected",
      });

      await db.exec(`
        insert into public.streamvista_legacy_links (source_table, legacy_id)
        values ('films_film', 'new-unresolved');
      `);
      const fresh = await db.query<{
        bridge_title_id: string | null;
        candidate_bridge_title_id: string | null;
        resolution_status: string;
        review_status: string;
      }>(`
        select bridge_title_id, candidate_bridge_title_id, resolution_status, review_status
        from public.streamvista_legacy_links
        where source_table='films_film' and legacy_id='new-unresolved'
      `);
      assert.deepEqual(fresh.rows[0], {
        bridge_title_id: null,
        candidate_bridge_title_id: null,
        resolution_status: "unresolved",
        review_status: "pending",
      });

      await assert.rejects(
        db.query(`
          insert into public.streamvista_legacy_links
            (source_table, legacy_id, bridge_title_id, review_status)
          values ('films_film', 'must-not-auto-resolve', 'title-jananam', 'pending')
        `),
        /violates check constraint|check constraint/i,
      );

      // Replaying the migration must not undo a human-reviewed resolution.
      await db.exec(migration);
      const stillVerified = await db.query<{ resolution_status: string; bridge_title_id: string | null }>(`
        select resolution_status, bridge_title_id
        from public.streamvista_legacy_links
        where source_table='films_payment' and legacy_id='paid-1'
      `);
      assert.equal(stillVerified.rows[0]?.resolution_status, "resolved");
      assert.equal(stillVerified.rows[0]?.bridge_title_id, null);
    } finally {
      await db.close();
    }
  });
});


describe("Super Admin legacy mapping review", () => {
  it("fails closed unless a verified Super Admin reviews an unresolved mapping with evidence", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "src/lib/bridge/legacy-link-review.ts"),
      "utf8",
    );
    const route = readFileSync(
      join(process.cwd(), "src/routes/internal.legacy-links.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      join(process.cwd(), "src/components/bridge/legacy-link-review-panel.tsx"),
      "utf8",
    );

    assert.match(source, /requireVerifiedActor\(userId\)/);
    assert.match(source, /actor\.internalRole !== "super_admin"/);
    assert.match(source, /review_status = 'pending'/);
    assert.match(source, /resolution_status = 'unresolved'/);
    assert.match(source, /for update/i);
    assert.match(source, /evidenceNote: z\.string\(\)\.trim\(\)\.min\(20\)/);
    assert.match(source, /review_status = 'verified'/);
    assert.match(source, /resolution_status = 'resolved'/);
    assert.match(source, /reviewed_by = \$\{actor\.userId\}/);
    assert.match(source, /reviewed_at = now\(\)/);
    assert.match(source, /writeAudit\([\s\S]*?streamvista_legacy_link/);
    assert.match(source, /merged_into_title_id is null|merged_into_title_id !== null/);

    assert.match(route, /RequireBridge allow="super_admin"/);
    assert.match(panel, /Verify selected mapping/);
    assert.match(panel, /Reject suggestion/);
    assert.match(panel, /A suggestion is not an approval/);
    assert.match(panel, /does not approve QC/);
  });
});
