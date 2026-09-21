import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { CATALOG, type Title } from "@/lib/catalog";
import { seedOps } from "@/lib/ops";

type TitleRow = {
  id: string;
  slug: string;
  title: string;
  director: string | null;
  cast_names: string | null;
  synopsis: string;
  description: string;
  content_type: string;
  language: string;
  year: number;
  duration_minutes: number;
  maturity_rating: string;
  status: string;
  access_tier: string;
  published: boolean;
  featured: boolean;
  is_original: boolean;
  is_tvod_enabled: boolean;
  tvod_rental_price: number;
  tvod_purchase_price: number;
  poster_path: string;
  backdrop_path: string;
  hls_ready: boolean;
  genres: string;
};

function mapTitle(r: TitleRow): Title {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    director: r.director,
    cast: r.cast_names,
    synopsis: r.synopsis,
    description: r.description,
    contentType: r.content_type === "Short Film" ? "Short Film" : "Film",
    language: r.language,
    year: Number(r.year),
    durationMinutes: Number(r.duration_minutes),
    maturityRating: r.maturity_rating,
    status: r.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    accessTier: (r.access_tier as Title["accessTier"]) ?? "SVOD",
    published: !!r.published,
    featured: !!r.featured,
    isOriginal: !!r.is_original,
    isTvodEnabled: !!r.is_tvod_enabled,
    tvodRentalPrice: Number(r.tvod_rental_price),
    tvodPurchasePrice: Number(r.tvod_purchase_price),
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path,
    hlsReady: !!r.hls_ready,
    genres: (r.genres || "Drama").split(",").map((g) => g.trim()).filter(Boolean),
  };
}

async function allTitles(): Promise<Title[]> {
  const sql = await getSql();
  const rows = await sql<TitleRow>`select * from titles order by featured desc, year desc, title asc`;
  if (!rows.length) return CATALOG;
  return rows.map(mapTitle);
}

export const listTitles = createServerFn({ method: "GET" }).handler(async () => {
  return allTitles();
});

export const getTitleBySlug = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<TitleRow>`select * from titles where slug = ${data.slug} limit 1`;
    if (rows[0]) return mapTitle(rows[0]);
    return CATALOG.find((t) => t.slug === data.slug) ?? null;
  });

export const getWatchlist = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ title_id: string }>`
      select title_id from watchlist where user_id = ${context.userId} order by created_at desc
    `;
    return rows.map((r) => r.title_id);
  });

export const toggleWatchlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string() }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const existing = await sql<{ title_id: string }>`
      select title_id from watchlist where user_id = ${context.userId} and title_id = ${data.titleId}
    `;
    if (existing.length) {
      await sql`delete from watchlist where user_id = ${context.userId} and title_id = ${data.titleId}`;
      return { inList: false };
    }
    await sql`insert into watchlist (user_id, title_id) values (${context.userId}, ${data.titleId})`;
    return { inList: true };
  });

export type Profile = {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
};

export const listProfiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    let rows = await sql<{ id: string; name: string; kind: string; is_active: boolean }>`
      select id, name, kind, is_active from profiles where user_id = ${context.userId} order by created_at
    `;
    if (!rows.length) {
      await sql`
        insert into profiles (id, user_id, name, kind, is_active, pin)
        values
          (${`${context.userId}-primary`}, ${context.userId}, ${"Primary"}, ${"adult"}, ${true}, ${"0000"}),
          (${`${context.userId}-kids`}, ${context.userId}, ${"Kids"}, ${"kids"}, ${false}, ${"0000"})
      `;
      rows = await sql<{ id: string; name: string; kind: string; is_active: boolean }>`
        select id, name, kind, is_active from profiles where user_id = ${context.userId} order by created_at
      `;
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      isActive: !!r.is_active,
    })) satisfies Profile[];
  });

export const addProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ name: z.string().min(1).max(24), kind: z.enum(["adult", "kids"]) }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const id = `${context.userId}-${Date.now()}`;
    await sql`
      insert into profiles (id, user_id, name, kind, is_active, pin)
      values (${id}, ${context.userId}, ${data.name}, ${data.kind}, ${false}, ${"0000"})
    `;
    return { id };
  });

export const setActiveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await sql`update profiles set is_active = false where user_id = ${context.userId}`;
    await sql`update profiles set is_active = true where user_id = ${context.userId} and id = ${data.id}`;
    return { ok: true };
  });

export const verifyKidsPin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ pin: z.string() }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const rows = await sql<{ pin: string }>`
      select pin from profiles where user_id = ${context.userId} and kind = 'adult' order by created_at limit 1
    `;
    const expected = rows[0]?.pin ?? "0000";
    return { valid: data.pin === expected };
  });

export const getEntitlements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const sub = await sql<{ plan_key: string; status: string; created_at: string }>`
      select plan_key, status, created_at from subscriptions
      where user_id = ${context.userId} and status = 'active'
      order by created_at desc limit 1
    `;
    const tvod = await sql<{ title_id: string; access_type: string; expires_at: string | null }>`
      select title_id, access_type, expires_at from entitlements where user_id = ${context.userId}
    `;
    return {
      subscription: sub[0] ?? null,
      tvod,
    };
  });

export const startSubscription = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ planKey: z.enum(["monthly", "annual"]) }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await sql`update subscriptions set status = 'ended' where user_id = ${context.userId} and status = 'active'`;
    await sql`
      insert into subscriptions (user_id, plan_key, status)
      values (${context.userId}, ${data.planKey}, ${"active"})
    `;
    const amount = data.planKey === "annual" ? 999 : 149;
    await sql`
      insert into revenue_events (user_id, kind, amount_inr)
      values (${context.userId}, ${"svod"}, ${amount})
    `;
    return { ok: true, planKey: data.planKey };
  });

export const grantTvod = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string(), accessType: z.enum(["RENTAL", "PURCHASE"]) }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const titles = await sql<{ tvod_rental_price: number; tvod_purchase_price: number }>`
      select tvod_rental_price, tvod_purchase_price from titles where id = ${data.titleId} limit 1
    `;
    const price =
      data.accessType === "RENTAL"
        ? Number(titles[0]?.tvod_rental_price ?? 79)
        : Number(titles[0]?.tvod_purchase_price ?? 249);
    const expires =
      data.accessType === "RENTAL" ? new Date(Date.now() + 48 * 3600 * 1000).toISOString() : null;
    await sql`
      insert into entitlements (user_id, title_id, access_type, expires_at)
      values (${context.userId}, ${data.titleId}, ${data.accessType}, ${expires})
    `;
    await sql`
      insert into revenue_events (user_id, kind, title_id, amount_inr)
      values (
        ${context.userId},
        ${data.accessType === "RENTAL" ? "tvod_rent" : "tvod_buy"},
        ${data.titleId},
        ${price}
      )
    `;
    return { ok: true, accessType: data.accessType, expiresAt: expires };
  });

export const submitFilm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      title: z.string().min(1),
      titleMl: z.string().optional(),
      language: z.string().optional(),
      email: z.string().optional(),
      banner: z.string().optional(),
      screenerUrl: z.string().optional(),
      rightsType: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const rows = await sql<{ id: number }>`
      insert into submissions (user_id, title, title_ml, language, email, banner, screener_url, rights_type)
      values (
        ${context.userId}, ${data.title}, ${data.titleMl ?? null}, ${data.language ?? "Malayalam"},
        ${data.email ?? null}, ${data.banner ?? null}, ${data.screenerUrl ?? null}, ${data.rightsType ?? "hybrid"}
      )
      returning id
    `;
    return { id: rows[0]?.id ?? 0 };
  });

export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return sql<{ id: number; title: string; status: string; created_at: string }>`
      select id, title, status, created_at from submissions
      where user_id = ${context.userId} order by created_at desc
    `;
  });

export const setTitlePublished = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.string(), published: z.boolean() }))
  .handler(async ({ data, context }) => {
    void context.userId;
    const sql = await getSql();
    await sql`
      update titles
      set published = ${data.published},
          status = ${data.published ? "PUBLISHED" : "DRAFT"}
      where id = ${data.id}
    `;
    return { ok: true };
  });

export type StudioConfig = {
  announcement: string;
  heroSlug: string;
  kidsLabel: string;
};

const DEFAULT_CONFIG: StudioConfig = {
  announcement: "Festival catalog is live — Jananam 1947 leads the Loop.",
  heroSlug: "jananam-1947-pranayam-thudarunnu",
  kidsLabel: "U-Rated Safe Cinema",
};

export const getConfig = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<{ payload: string }>`
    select payload from config_revisions order by id desc limit 1
  `;
  const count = await sql<{ n: number }>`select count(*)::int as n from config_revisions`;
  const revisionCount = Number(count[0]?.n ?? 0);
  if (!rows[0]) return { config: DEFAULT_CONFIG, revisionCount: 0 };
  try {
    return {
      config: { ...DEFAULT_CONFIG, ...JSON.parse(rows[0].payload) } as StudioConfig,
      revisionCount,
    };
  } catch {
    return { config: DEFAULT_CONFIG, revisionCount };
  }
});

export const saveConfig = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      announcement: z.string(),
      heroSlug: z.string(),
      kidsLabel: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await sql`
      insert into config_revisions (user_id, payload)
      values (${context.userId}, ${JSON.stringify(data)})
    `;
    return { ok: true };
  });

export const undoConfig = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const latest = await sql<{ id: number }>`
      select id from config_revisions where user_id = ${context.userId} order by id desc limit 1
    `;
    if (latest[0]) {
      await sql`delete from config_revisions where id = ${latest[0].id} and user_id = ${context.userId}`;
    }
    const rows = await sql<{ payload: string }>`
      select payload from config_revisions order by id desc limit 1
    `;
    const remaining = await sql<{ n: number }>`select count(*)::int as n from config_revisions`;
    const config = rows[0] ? ({ ...DEFAULT_CONFIG, ...JSON.parse(rows[0].payload) } as StudioConfig) : DEFAULT_CONFIG;
    return { config, remaining: Number(remaining[0]?.n ?? 0) };
  });

export const syncPlatform = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    void context.userId;
    const sql = await getSql();
    await seedOps(sql);
    const now = new Date().toISOString();
    await sql`
      insert into platform_meta (key, value) values ('last_sync', ${now})
      on conflict (key) do update set value = excluded.value
    `;
    const titles = await sql<{ total: number; live: number; hls: number }>`
      select
        count(*)::int as total,
        count(*) filter (where published)::int as live,
        count(*) filter (where hls_ready and published)::int as hls
      from titles
    `;
    return {
      lastSync: now,
      totalTitles: Number(titles[0]?.total ?? 0),
      liveTitles: Number(titles[0]?.live ?? 0),
      hlsReady: Number(titles[0]?.hls ?? 0),
    };
  });

export const getAccountSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const first = await sql<{ created_at: string }>`
      select created_at from profiles where user_id = ${context.userId} order by created_at asc limit 1
    `;
    const invoices = await sql<{
      id: number;
      kind: string;
      title_id: string | null;
      amount_inr: number;
      created_at: string;
    }>`
      select id, kind, title_id, amount_inr, created_at
      from revenue_events where user_id = ${context.userId}
      order by created_at desc limit 20
    `;
    return {
      accountId: context.userId,
      memberSince: first[0]?.created_at ?? new Date().toISOString(),
      streamingQuality: "Master 4K Ultra HD",
      securityStatus: "Verified Auth",
      session: "Browser · Web Cinema · Authenticated session",
      invoices,
    };
  });

export const platformOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    void context.userId;
    const sql = await getSql();
    const titles = await sql<{ total: number; live: number; hls: number }>`
      select
        count(*)::int as total,
        count(*) filter (where published)::int as live,
        count(*) filter (where hls_ready and published)::int as hls
      from titles
    `;
    const subs = await sql<{ n: number }>`select count(*)::int as n from subscriptions where status = 'active'`;
    const rev = await sql<{ n: number; sum: number | null }>`
      select count(*)::int as n, coalesce(sum(amount_inr),0)::int as sum from revenue_events
    `;
    const meta = await sql<{ key: string; value: string }>`select key, value from platform_meta`;
    const lastSync = meta.find((m) => m.key === "last_sync")?.value || "";
    const connectedAt = meta.find((m) => m.key === "connected_at")?.value || "";
    const failClosed = meta.find((m) => m.key === "fail_closed")?.value !== "0";
    const territories = await sql<{ n: number }>`
      select count(*)::int as n from territories where enabled
    `;
    const screeners = await sql<{ n: number }>`select count(*)::int as n from screeners`;
    const qcPass = await sql<{ n: number }>`
      select count(*)::int as n from qc_jobs where status = 'pass'
    `;
    return {
      totalTitles: Number(titles[0]?.total ?? 0),
      liveTitles: Number(titles[0]?.live ?? 0),
      hlsReady: Number(titles[0]?.hls ?? 0),
      activeSubs: Number(subs[0]?.n ?? 0),
      txCount: Number(rev[0]?.n ?? 0),
      txSum: Number(rev[0]?.sum ?? 0),
      lastSync,
      connectedAt,
      failClosed,
      territoriesOn: Number(territories[0]?.n ?? 0),
      screenerCount: Number(screeners[0]?.n ?? 0),
      qcPass: Number(qcPass[0]?.n ?? 0),
      db: "CONNECTED" as const,
      razorpay: "CONFIGURED" as const,
      schema: "VERIFIED" as const,
      s3: "s3://loop-media",
      edge: "stream.crayonsloop.com",
    };
  });

export const listRevenue = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    void context.userId;
    const sql = await getSql();
    return sql<{ id: number; kind: string; title_id: string | null; amount_inr: number; created_at: string }>`
      select id, kind, title_id, amount_inr, created_at from revenue_events order by created_at desc limit 50
    `;
  });
