# Crayons Bridge + Crayons Loop — Storage Economics

## Principle

Storage tier is a physical cost/performance decision, not a licensing entitlement.

- OCI Standard: active production and playback.
- OCI Infrequent Access: colder assets that remain readily retrievable.
- OCI Archive: explicit long-term preservation only.
- Delete: exception path for temporary/abandoned, retention-expired data.

Loop access_tier (FREE/SVOD/TVOD) remains a commercial entitlement and must never be treated as an OCI tier.

## Business signals

The storage policy evaluates asset role, Bridge title lifecycle, Loop publication/playback, licensing and delivery activity, access recency, retention, and legal/commercial holds.

The policy must explain every recommendation with a reason. Recommendations should be reviewable before physical object movement.

## Protected assets

The system must not automatically archive/delete an asset when it is needed for active Loop playback, active licensing/delivery, legal hold, commercial hold, or as the sole master.

## Cost control

The system should later record provider/tier/bytes and estimate monthly cost so owners can see:
current storage cost -> recommended tier -> estimated savings.

## Next implementation stages

1. Add OCI physical tier inspection/update/restore methods.
2. Add controlled admin action to apply a recommendation.
3. Add access telemetry on signed downloads/playback.
4. Add a daily policy evaluator that produces recommendations only.
5. Add a second-stage worker that applies only safe Standard-to-Infrequent moves.
6. Add explicit Archive/restore workflow.
7. Add protected deletion workflow for retention-expired temporary/abandoned objects.
8. Add title-level storage cost and profitability reporting.
