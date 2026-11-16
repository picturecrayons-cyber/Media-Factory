create extension if not exists vector;

create table if not exists public.loop_title_embeddings (
  title_id uuid primary key references public.loop_titles(id) on delete cascade,
  model text not null default 'sentence-transformers/all-MiniLM-L6-v2',
  content text not null,
  embedding vector(384) not null,
  updated_at timestamptz not null default now()
);

alter table public.loop_title_embeddings enable row level security;

create index if not exists loop_title_embeddings_hnsw_idx
  on public.loop_title_embeddings
  using hnsw (embedding vector_cosine_ops);

create or replace function public.match_loop_titles(
  query_embedding vector(384),
  match_count integer default 20
)
returns table (
  title_id uuid,
  similarity double precision
)
language sql
stable
security definer
set search_path = public
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

revoke all on function public.match_loop_titles(vector, integer) from public, anon, authenticated;
