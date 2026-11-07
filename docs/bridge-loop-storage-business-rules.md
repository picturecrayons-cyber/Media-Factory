# Bridge + Loop Storage Business Rules

## Asset classes

Treat each asset/version independently.

| Asset role | Default tier | Reason |
| --- | --- | --- |
| Loop playback asset | STANDARD | User-facing playback must remain readily available |
| Active master | STANDARD | Production/licensing readiness |
| Cold master | INFREQUENT | Lower recurring cost while remaining readily retrievable |
| Review/proxy asset | INFREQUENT | Usually regenerable or rarely used |
| Preservation master | ARCHIVE | Long-term preservation only |
| Temporary/failed asset | INFREQUENT then delete review | Never immediate deletion |

## Hard protection rules

Never auto-archive or auto-delete an asset that is:
- serving active Loop playback
- inside an active delivery
- required by current licensing/commercial activity
- under legal hold or commercial hold
- the sole verified master/source needed for recovery
- referenced by an active destination package

## Business separation

Loop `access_tier` = FREE/SVOD/TVOD commercial entitlement.
OCI `storage_tier` = STANDARD/INFREQUENT/ARCHIVE physical storage.
These are separate dimensions.

A TVOD title can still use STANDARD playback storage.
A FREE title can have an ARCHIVE preservation master.
A LICENSED title does not automatically force every asset to STANDARD.

## Transition philosophy

The business policy engine recommends a safe state.
A storage controller is responsible for applying a physical OCI change.
Every transition is auditable with the asset, previous tier, new tier, reason, actor/worker, and timestamp.

## Cost intelligence

At title level expose:
- total media bytes
- bytes by OCI tier
- estimated monthly storage cost
- possible monthly savings
- retrieval/restore exposure
- protected bytes
- deletable candidate bytes

Recommendations are explainable and should never silently change a title's business rights.

## Archive and restore

Archive is opt-in through explicit preservation state.
Restoration must be visible as a workflow state so delivery/licensing workers do not assume an archived object is immediately readable.
