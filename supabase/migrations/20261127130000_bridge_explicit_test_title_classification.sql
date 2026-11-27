-- Explicitly classify known Preview/test records. Real titles default to non-test.
alter table public.bridge_titles
  add column if not exists is_test boolean not null default false;

update public.bridge_titles
set is_test = true, updated_at = now()
where id in (
  '7d791a708c4b1384e2543101873fccbe',
  '86c01f36770066c716df7a6c0148e133',
  '3b9b45ab1af35bd1f9251aebb50b9e24',
  'test-fixture-paid-film-20261124'
);
