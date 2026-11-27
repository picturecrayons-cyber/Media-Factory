-- Use Bridge's existing explicit classification field; do not add a parallel test flag.
-- These five IDs were read from the isolated Testing database and verified as test fixtures.
update public.bridge_titles
set record_classification = 'TEST', updated_at = now()
where id in (
  '7d791a708c4b1384e2543101873fccbe',
  '86c01f36770066c716df7a6c0148e133',
  '3b9b45ab1af35bd1f9251aebb50b9e24',
  'test-fixture-free-video-20261124',
  'test-fixture-paid-film-20261124'
)
  and record_classification <> 'TEST';
