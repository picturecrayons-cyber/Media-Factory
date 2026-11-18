import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { LoopTitle, ConsumerEntitlement } from "./types";

type CatalogRow = {
  id: string;
  bridge_title_id: string | null;
  slug: string;
  title: string;
  synopsis: string;
  description: string;
  content_type: string;
  language: string;
  year: number | null;
  duration_minutes: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  playback_path: string | null;
  maturity_rating: string;
  genres: string;
  access_tier: string;
  tvod_rental_price: number;
  tvod_purchase_price: number;
  featured: boolean;
  published: boolean;
  authorization_status: string;
  window_start: string | Date | null;
  window_end: string | Date | null;
};

function mapCatalogRow(r: CatalogRow): LoopTitle {
  return {
    id: r.id,
    bridgeTitleId: r.bridge_title_id,
    slug: r.slug,
    title: r.title,
    synopsis: r.synopsis,
    description: r.description || r.synopsis,
    contentType: r.content_type || "Film",
    language: r.language || "Malayalam",
    year: r.year,
    durationMinutes: r.duration_minutes,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path || r.poster_path,
    // Raw OCI object keys are never returned by public catalog/detail APIs.
    playbackPath: null,
    maturityRating: r.maturity_rating || "U",
    genres: (r.genres || "Drama").split(",").map((g) => g.trim()).filter(Boolean),
    accessTier: (r.access_tier as "FREE" | "SVOD" | "TVOD") || "SVOD",
    tvodRentalPrice: r.tvod_rental_price || 79,
    tvodPurchasePrice: r.tvod_purchase_price || 249,
    featured: Boolean(r.featured),
    published: Boolean(r.published),
    authorizationStatus: r.authorization_status,
    windowStart: r.window_start ? new Date(r.window_start).toISOString() : null,
    windowEnd: r.window_end ? new Date(r.window_end).toISOString() : null,
  };
}

/**
 * Public catalog presentation for Crayons Loop OTT.
 * Strictly reads only titles authorized for consumer distribution by Bridge.
 * Enforces active window, published status, and approval.
 */
export const getLoopCatalog = createServerFn({ method: "GET" })
  .validator(
    z.object({
      genre: z.string().optional(),
      language: z.string().optional(),
      query: z.string().optional(),
      kidsOnly: z.boolean().optional(),
    }).optional()
  )
  .handler(async ({ data }) => {
    const sql = await getSql();

    // Query authorized titles with active publication window
    const rows = await sql<CatalogRow>`
      select
        l.id, l.bridge_title_id, l.slug, l.title, l.synopsis, l.description,
        l.content_type, l.language, l.year, l.duration_minutes, l.poster_path,
        l.backdrop_path, l.playback_path, l.maturity_rating, l.genres,
        l.access_tier, l.tvod_rental_price, l.tvod_purchase_price, l.featured,
        l.published,
        p.authorization_status, p.window_start, p.window_end
      from loop_titles l
      join bridge_loop_publications p on p.loop_title_id = l.id
      where p.authorization_status = 'authorized'
        and l.published = true
        and l.listed = true
        and l.status = 'approved'
        and (p.window_start is null or p.window_start <= now())
        and (p.window_end is null or p.window_end >= now())
      order by l.featured desc, l.created_at desc
      limit 100
    `;

    let titles = rows.map(mapCatalogRow);

    if (data?.kidsOnly) {
      titles = titles.filter((t) => t.maturityRating === "U");
    }
    if (data?.genre) {
      const g = data.genre.toLowerCase();
      titles = titles.filter((t) => t.genres.some((genre) => genre.toLowerCase().includes(g)));
    }
    if (data?.language) {
      const lang = data.language.toLowerCase();
      titles = titles.filter((t) => t.language.toLowerCase() === lang);
    }
    if (data?.query) {
      const q = data.query.toLowerCase().trim();
      titles = titles.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.synopsis.toLowerCase().includes(q) ||
          t.genres.some((genre) => genre.toLowerCase().includes(q))
      );
    }

    const featured = titles.filter((t) => t.featured);
    const heroTitle = featured[0] || titles[0] || null;

    const rails = [
      {
        id: "originals",
        title: "Crayons Originals & Exclusives",
        description: "Authoritative Malayalam cinema directly from master storytellers",
        titles: titles.filter((t) => t.genres.includes("Crayons Original") || t.featured),
      },
      {
        id: "tvod",
        title: "Premieres & TVOD Rentals",
        description: "Fresh out of festival circuits — watch now on early access",
        titles: titles.filter((t) => t.accessTier === "TVOD"),
      },
      {
        id: "svod",
        title: "Included with Loop Pass",
        description: "Unlimited streaming of indie gems and critically acclaimed features",
        titles: titles.filter((t) => t.accessTier === "SVOD"),
      },
      {
        id: "drama",
        title: "Acclaimed Dramas",
        description: "Deep narratives, authentic performances, and emotional resonance",
        titles: titles.filter((t) => t.genres.includes("Drama") || t.genres.includes("Festival")),
      },
      {
        id: "free",
        title: "Free Screeners & Shorts",
        description: "Curated short stories and proof-of-concept showcases",
        titles: titles.filter((t) => t.accessTier === "FREE" || (t.durationMinutes && t.durationMinutes < 30)),
      },
    ].filter((r) => r.titles.length > 0);

    return {
      heroTitle,
      titles,
      rails,
      totalCount: titles.length,
    };
  });

/**
 * Get detailed title presentation for Loop playback and overview.
 * Validates consumer authorization and active distribution window.
 */
export const getLoopTitleDetails = createServerFn({ method: "GET" })
  .validator(z.object({ slugOrId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<CatalogRow>`
      select
        l.id, l.bridge_title_id, l.slug, l.title, l.synopsis, l.description,
        l.content_type, l.language, l.year, l.duration_minutes, l.poster_path,
        l.backdrop_path, l.playback_path, l.maturity_rating, l.genres,
        l.access_tier, l.tvod_rental_price, l.tvod_purchase_price, l.featured,
        l.published,
        p.authorization_status, p.window_start, p.window_end
      from loop_titles l
      join bridge_loop_publications p on p.loop_title_id = l.id
      where (l.id = ${data.slugOrId} or l.slug = ${data.slugOrId})
        and p.authorization_status = 'authorized'
        and l.published = true
        and l.status = 'approved'
        and (p.window_start is null or p.window_start <= now())
        and (p.window_end is null or p.window_end > now())
      limit 1
    `;

    const r = rows[0];
    if (!r) {
      throw new Error("Title not found or not currently authorized for consumer streaming.");
    }

    const title = mapCatalogRow(r);

    // Get related titles from same genre or language
    const relatedRows = await sql<CatalogRow>`
      select
        l.id, l.bridge_title_id, l.slug, l.title, l.synopsis, l.description,
        l.content_type, l.language, l.year, l.duration_minutes, l.poster_path,
        l.backdrop_path, l.playback_path, l.maturity_rating, l.genres,
        l.access_tier, l.tvod_rental_price, l.tvod_purchase_price, l.featured,
        l.published,
        p.authorization_status, p.window_start, p.window_end
      from loop_titles l
      join bridge_loop_publications p on p.loop_title_id = l.id
      where l.id != ${title.id}
        and p.authorization_status = 'authorized'
        and l.published = true and l.listed = true and l.status='approved'
        and (p.window_start is null or p.window_start <= now())
        and (p.window_end is null or p.window_end > now())
      limit 6
    `;

    return {
      title,
      related: relatedRows.map(mapCatalogRow),
    };
  });

/**
 * Check consumer playback entitlement for a specific title.
 * Validates whether user is subscribed (SVOD) or has rented/purchased (TVOD) or if title is FREE.
 */
export const checkPlaybackEntitlement = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ loopTitleId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<ConsumerEntitlement> => {
    const sql = await getSql();

    // Check title access tier
    const titles = await sql<{ id: string; access_tier: string }>`
      select l.id,l.access_tier
      from loop_titles l
      join bridge_loop_publications p on p.loop_title_id=l.id and p.bridge_title_id=l.bridge_title_id
      where l.id=${data.loopTitleId} and l.status='approved' and l.listed=true and l.published=true
        and p.authorization_status='authorized' and p.revoked_at is null
        and (p.window_start is null or p.window_start<=now())
        and (p.window_end is null or p.window_end>now())
      limit 1
    `;
    const title = titles[0];
    if (!title) {
      return { loopTitleId: data.loopTitleId, accessType: "FREE", expiresAt: null, canPlay: false };
    }

    if (title.access_tier === "FREE") {
      return { loopTitleId: data.loopTitleId, accessType: "FREE", expiresAt: null, canPlay: true };
    }

    // Check SVOD Subscription
    const subs = await sql<{ id: string; plan_key: string | null; expires_at: string | Date | null }>`
      select s.id::text as id,
        coalesce(to_jsonb(s)->>'plan_key',(select p.plan_key from loop_plans p where p.id::text=to_jsonb(s)->>'plan_id')) as plan_key,
        coalesce(nullif(to_jsonb(s)->>'expires_at','')::timestamptz,
                 nullif(to_jsonb(s)->>'current_period_end','')::timestamptz) as expires_at
      from loop_subscriptions s
      where s.user_id::text=${context.userId} and s.status='active'
        and coalesce(nullif(to_jsonb(s)->>'expires_at','')::timestamptz,
                     nullif(to_jsonb(s)->>'current_period_end','')::timestamptz)>now()
      limit 1
    `;

    if (subs.length > 0 && title.access_tier === "SVOD") {
      return {
        loopTitleId: data.loopTitleId,
        accessType: "SVOD_SUBSCRIPTION",
        expiresAt: subs[0].expires_at ? new Date(subs[0].expires_at).toISOString() : null,
        canPlay: true,
      };
    }

    // Canonical TVOD entitlements are created only by the verified payment-capture fulfillment.
    const tvods = await sql<{ id: string; access_type: string; expires_at: string | Date | null }>`
      select id,access_type,expires_at
      from loop_user_tvod_entitlements
      where user_id=${context.userId}::uuid and title_id=${data.loopTitleId}::uuid
        and status='ACTIVE' and (expires_at is null or expires_at>now())
      order by purchased_at desc
      limit 1
    `;

    if (tvods.length > 0) {
      return {
        loopTitleId: data.loopTitleId,
        accessType: tvods[0].access_type === "PURCHASE" ? "TVOD_PURCHASE" : "TVOD_RENTAL",
        expiresAt: tvods[0].expires_at ? new Date(tvods[0].expires_at).toISOString() : null,
        canPlay: true,
      };
    }

    return {
      loopTitleId: data.loopTitleId,
      accessType: title.access_tier === "TVOD" ? "TVOD_RENTAL" : "SVOD_SUBSCRIPTION",
      expiresAt: null,
      canPlay: false,
    };
  });

/**
 * Return a short-lived playback URL only after checking the current Bridge
 * distribution window and a real consumer entitlement.
 */
export const getAuthorizedLoopPlayback = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ loopTitleId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string; playback_path: string | null; access_tier: string;
    }>`
      select l.id,l.playback_path,l.access_tier
      from loop_titles l
      join bridge_loop_publications p on p.loop_title_id=l.id and p.bridge_title_id=l.bridge_title_id
      where l.id::text=${data.loopTitleId}
        and l.status='approved' and l.listed=true and l.published=true
        and p.authorization_status='authorized' and p.revoked_at is null
        and p.approved_at is not null
        and (p.window_start is null or p.window_start<=now())
        and (p.window_end is null or p.window_end>now())
      limit 1
    `;
    const title = rows[0];
    if (!title || !title.playback_path) throw new Error("Title is not currently authorized for playback");

    let accessType = "FREE";
    if (title.access_tier === "SVOD") {
      const subs = await sql<{ id: string }>`
        select s.id::text as id from loop_subscriptions s
        where s.user_id::text=${context.userId} and s.status='active'
          and coalesce(nullif(to_jsonb(s)->>'expires_at','')::timestamptz,
                       nullif(to_jsonb(s)->>'current_period_end','')::timestamptz)>now()
        limit 1
      `;
      if (!subs[0]) throw new Error("An active Loop Pass subscription is required");
      accessType = "SVOD_SUBSCRIPTION";
    } else if (title.access_tier === "TVOD") {
      const entitlements = await sql<{ access_type: string; expires_at: string | Date | null }>`
        select access_type,expires_at from loop_user_tvod_entitlements
        where user_id=${context.userId}::uuid and title_id=${title.id}::uuid
          and status='ACTIVE' and (expires_at is null or expires_at>now())
        order by purchased_at desc limit 1
      `;
      if (!entitlements[0]) throw new Error("A captured TVOD rental or purchase entitlement is required");
      accessType = entitlements[0].access_type === "PURCHASE" ? "TVOD_PURCHASE" : "TVOD_RENTAL";
    }
    const { signDownload } = await import("@/lib/bridge/oci-object-storage.server");
    const signed = await signDownload({ key: title.playback_path, expiresIn: 180 });
    return { url: signed.url, expiresIn: 180, accessType };
  });
