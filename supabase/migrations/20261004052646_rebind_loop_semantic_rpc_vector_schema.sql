drop function if exists public.match_loop_titles(vector, integer);
create or replace function public.match_loop_titles(
  query_embedding extensions.vector(384),
  match_count integer default 20
)
returns table (
  title_id uuid,
  similarity double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select e.title_id, 1 - (e.embedding <=> query_embedding) as similarity
  from public.loop_title_embeddings e
  join public.loop_titles t on t.id = e.title_id
  where t.status = 'approved'
    and t.listed = true
    and t.published = true
  order by e.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;
revoke all on function public.match_loop_titles(extensions.vector, integer) from public, anon, authenticated;
