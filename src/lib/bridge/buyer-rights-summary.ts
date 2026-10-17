import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { requireVerifiedActor } from "./session";
import { assertBuyerPublishable } from "./buyer-visibility";
import { assertNotDevUser } from "./guards";

export const getBuyerRightsSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ titleId: z.string().min(8) }))
  .handler(async ({ context, data }) => {
    assertNotDevUser(context.userId);
    const actor = await requireVerifiedActor(context.userId);
    if (actor.accountType !== "buyer" || actor.internalRole) throw new Error("Forbidden");
    await assertBuyerPublishable(data.titleId);
    const sql = await getSql();

    const [titles, grants, packages, assets, versions] = await Promise.all([
      sql<{name:string;language:string;year:number|null;runtime_minutes:number|null;synopsis:string;country_of_origin:string|null;content_type:string;credits:any[]}>`select name,language,year,runtime_minutes,synopsis,country_of_origin,content_type,credits from bridge_titles where id=${data.titleId} limit 1`,
      sql<{territories:string[];languages:string[];media:string[];window_start:string|Date;window_end:string|Date;exclusivity:string}>`select territories,languages,media,window_start,window_end,exclusivity from bridge_rights_grants where title_id=${data.titleId} and status='VALID' and window_end>now() order by window_end asc limit 1`,
      sql<{destination:string;package_version:number;readiness_state:string;commercial_model:any}>`select destination,package_version,readiness_state,commercial_model from bridge_destination_packages where title_id=${data.titleId} and readiness_state in ('READY','AUTHORIZED','DELIVERED') order by package_version desc limit 20`,
      sql<{kind:string;byte_size:number|null}>`select kind,byte_size from bridge_assets where title_id=${data.titleId} and byte_size>0`,
      sql<{asset_type:string;language:string|null;processing_state:string}>`select asset_type,language,processing_state from bridge_asset_versions where title_id=${data.titleId} and processing_state='PASSED'`,
    ]);
    const title=titles[0], grant=grants[0];
    if(!title || !grant) throw new Error("Rights summary unavailable");
    const passedVersions=versions.filter(v=>v.processing_state==="PASSED");
    return {
      title,
      rights: { territories: grant.territories, languages: grant.languages, media: grant.media, windowStart: new Date(grant.window_start).toISOString(), windowEnd: new Date(grant.window_end).toISOString(), exclusivity: grant.exclusivity },
      packages,
      readiness: {
        master: assets.some(a=>a.kind==="master"),
        screener: assets.some(a=>a.kind==="screener"),
        artwork: assets.some(a=>a.kind==="poster"),
        subtitles: assets.some(a=>a.kind==="subtitle") || passedVersions.some(v=>v.asset_type.toLowerCase().includes("subtitle")),
        passedVersionLanguages: [...new Set(passedVersions.map(v=>v.language).filter(Boolean))],
      },
    };
  });
