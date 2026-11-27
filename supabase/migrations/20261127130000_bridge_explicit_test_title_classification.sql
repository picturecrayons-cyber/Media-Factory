-- Explicitly classify known Preview/test records. Real titles default to non-test.
alter table public.bridge_titles
  add column if not exists is_test boolean not null default false;

update public.bridge_titles
set is_test = true, updated_at = now()
where id in (
  '7d791a708c4b1384e2543101873fccbe',
  '86c01f36770066c716df7a6c0148e133',
  '3b9b45ab1af35bd1f9251aebb50b9e24',
  'test-fixture-paid-film-20261124',
  '43d183d2da9e0c673df9c85d2db11d46',
  '7f6265b66013abe582dc5e16aabe7b15',
  '4b6fa1e61c4268dcea5ea0865295088b',
  'd8c1d183d047835e96ebdc5b3df35613',
  '518bf0368deafaae8c480e637a0753ff'
);
