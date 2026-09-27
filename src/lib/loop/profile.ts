import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { LoopProfile, LoopWatchProgress, LoopSubscription } from "./types";

/**
 * Get or automatically provision the consumer profile for the authenticated Supabase user.
 * Supports multiple profiles per consumer account (e.g. Primary Adult + Kids profile).
 */
export const getConsumerProfiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ profiles: LoopProfile[]; activeProfile: LoopProfile }> => {
    const sql = await getSql();

    let rows = await sql<{
      id: string;
      user_id: string;
      name: string;
      kind: string;
      is_active: boolean;
      pin: string;
      avatar: string | null;
      created_at: string | Date;
    }>`
      select id, user_id, name, kind, is_active, pin, avatar, created_at
      from loop_profiles
      where user_id = ${context.userId}
      order by kind asc, created_at asc
    `;

    // Lazy default creation if user has no Loop profiles yet
    if (rows.length === 0) {
      const primaryId = randomUUID();
      const kidsId = randomUUID();
      const defaultName = context.userEmail?.split("@")[0] || "Viewer";

      await sql`
        insert into loop_profiles (id, user_id, name, kind, is_active, pin, avatar)
        values
          (${primaryId}, ${context.userId}, ${defaultName}, 'adult', true, '0000', '👤'),
          (${kidsId}, ${context.userId}, 'Crayons Kids', 'kids', false, '0000', '🎨')
        on conflict (id) do nothing
      `;

      rows = await sql<{
        id: string;
        user_id: string;
        name: string;
        kind: string;
        is_active: boolean;
        pin: string;
        avatar: string | null;
        created_at: string | Date;
      }>`
        select id, user_id, name, kind, is_active, pin, avatar, created_at
        from loop_profiles
        where user_id = ${context.userId}
        order by kind asc, created_at asc
      `;
    }

    const profiles: LoopProfile[] = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      kind: (r.kind as "adult" | "kids") || "adult",
      isActive: Boolean(r.is_active),
      pin: r.pin || "0000",
      avatar: r.avatar || (r.kind === "kids" ? "🎨" : "👤"),
      createdAt: new Date(r.created_at).toISOString(),
    }));

    const activeProfile = profiles.find((p) => p.isActive) || profiles[0];

    return { profiles, activeProfile };
  });

/**
 * Switch active consumer profile (e.g. switch to Kids profile)
 */
export const setActiveConsumerProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ profileId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update loop_profiles set is_active = false where user_id = ${context.userId}`;
    await sql`update loop_profiles set is_active = true where user_id = ${context.userId} and id = ${data.profileId}`;
    return { ok: true };
  });

/**
 * Create a new consumer profile (adult or kids)
 */
export const createConsumerProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().min(1).max(40),
      kind: z.enum(["adult", "kids"]),
      avatar: z.string().optional(),
    })
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const id = randomUUID();
    const avatar = data.avatar || (data.kind === "kids" ? "🎈" : "🎬");

    await sql`
      insert into loop_profiles (id, user_id, name, kind, is_active, pin, avatar)
      values (${id}, ${context.userId}, ${data.name}, ${data.kind}, false, '0000', ${avatar})
    `;

    return { ok: true, id };
  });

/**
 * Save playback position / watch progress for resume functionality
 */
export const saveWatchProgress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      loopTitleId: z.string().min(1),
      positionSeconds: z.number().int().min(0),
      durationSeconds: z.number().int().min(0),
    })
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const completed = data.durationSeconds > 0 && data.positionSeconds / data.durationSeconds > 0.9;

    await sql`
      insert into loop_watch_progress (
        user_id, loop_title_id, position_seconds, duration_seconds, completed, updated_at
      ) values (
        ${context.userId}, ${data.loopTitleId}, ${data.positionSeconds}, ${data.durationSeconds}, ${completed}, now()
      )
      on conflict (user_id, loop_title_id) do update set
        position_seconds = excluded.position_seconds,
        duration_seconds = excluded.duration_seconds,
        completed = excluded.completed,
        updated_at = now()
    `;

    return { ok: true };
  });

/**
 * Get watch progress for continuing watching
 */
export const getWatchProgress = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ loopTitleId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<LoopWatchProgress | null> => {
    const sql = await getSql();
    const rows = await sql<{
      loop_title_id: string;
      position_seconds: number;
      duration_seconds: number;
      completed: boolean;
      updated_at: string | Date;
    }>`
      select loop_title_id, position_seconds, duration_seconds, completed, updated_at
      from loop_watch_progress
      where user_id = ${context.userId} and loop_title_id = ${data.loopTitleId}
      limit 1
    `;

    if (!rows[0]) return null;

    return {
      loopTitleId: rows[0].loop_title_id,
      positionSeconds: rows[0].position_seconds,
      durationSeconds: rows[0].duration_seconds,
      completed: Boolean(rows[0].completed),
      updatedAt: new Date(rows[0].updated_at).toISOString(),
    };
  });

/**
 * Toggle title in consumer Watchlist
 */
export const toggleWatchlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ loopTitleId: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<{ loop_title_id: string }>`
      select loop_title_id from loop_watchlist
      where user_id = ${context.userId} and loop_title_id = ${data.loopTitleId}
      limit 1
    `;

    if (existing.length > 0) {
      await sql`
        delete from loop_watchlist
        where user_id = ${context.userId} and loop_title_id = ${data.loopTitleId}
      `;
      return { inWatchlist: false };
    } else {
      await sql`
        insert into loop_watchlist (user_id, loop_title_id)
        values (${context.userId}, ${data.loopTitleId})
        on conflict (user_id, loop_title_id) do nothing
      `;
      return { inWatchlist: true };
    }
  });

/**
 * Check if a title is in consumer watchlist
 */
export const isTitleInWatchlist = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ loopTitleId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<boolean> => {
    const sql = await getSql();
    const existing = await sql<{ loop_title_id: string }>`
      select loop_title_id from loop_watchlist
      where user_id = ${context.userId} and loop_title_id = ${data.loopTitleId}
      limit 1
    `;
    return existing.length > 0;
  });

/**
 * List consumer watchlist titles
 */
export const getConsumerWatchlist = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      bridge_title_id: string | null;
      slug: string;
      title: string;
      synopsis: string;
      poster_path: string | null;
      backdrop_path: string | null;
      maturity_rating: string;
      duration_minutes: number | null;
      access_tier: string;
    }>`
      select
        l.id, l.bridge_title_id, l.slug, l.title, l.synopsis, l.poster_path,
        l.backdrop_path, l.maturity_rating, l.duration_minutes, l.access_tier
      from loop_watchlist w
      join loop_titles l on l.id = w.loop_title_id
      where w.user_id = ${context.userId}
      order by w.created_at desc
    `;

    return {
      items: rows.map((r) => ({
        id: r.id,
        bridgeTitleId: r.bridge_title_id,
        slug: r.slug,
        title: r.title,
        synopsis: r.synopsis,
        posterPath: r.poster_path,
        backdropPath: r.backdrop_path,
        maturityRating: r.maturity_rating,
        durationMinutes: r.duration_minutes,
        accessTier: r.access_tier,
      })),
    };
  });
