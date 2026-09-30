create table if not exists public.bridge_site_content (
  content_key text primary key,
  hero_title text not null,
  hero_body text not null,
  workflow_heading text not null,
  audience_heading text not null,
  final_cta_heading text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.bridge_site_content enable row level security;
revoke all on table public.bridge_site_content from anon, authenticated;

insert into public.bridge_site_content (
  content_key, hero_title, hero_body, workflow_heading, audience_heading, final_cta_heading
) values (
  'homepage',
  'One bridge from content to market.',
  'The professional workspace for preparing, protecting, licensing and delivering film and television.',
  'From upload to delivery.',
  'Built for the media business.',
  'Ready to move your content forward?'
)
on conflict (content_key) do nothing;
