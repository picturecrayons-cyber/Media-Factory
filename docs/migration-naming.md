# Migration naming policy

## Existing migration history

Migration filenames are persisted verbatim in `_migrations.name`. Do not rename or
renumber an applied migration: the renamed file would look pending and could execute
its SQL a second time.

The root `migrations/` directory contains historical duplicate numeric-prefix groups
`0018` and `0020`. These exact filename groups are grandfathered in
`scripts/migration-plan.mjs`; do not add files to either group.

## New migrations

- Use the next unused numeric prefix, with at least four digits.
- Use one descriptive, lowercase snake-case suffix:
  `0022_bridge_<purpose>.sql` is the naming example for the next new migration.
- Every new root migration must have a unique numeric prefix.
- Keep migrations forward-only; use a new migration to correct earlier behavior.
- Do not rename historical files to make the sequence appear contiguous.

The migration prefix guard is covered by `scripts/migration-plan.test.mjs`. It allows
only the exact historical duplicate groups and rejects any newly introduced duplicate
prefix.
