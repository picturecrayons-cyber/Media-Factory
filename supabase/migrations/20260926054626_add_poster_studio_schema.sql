create table if not exists public.poster_jobs (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 original_path text not null unique,
 brand text not null,
 headline text not null,
 status text not null default 'preview' check(status in ('preview','paid')),
 order_id text unique,
 amount_paise integer check(amount_paise >= 100),
 payment_id text unique,
 created_at timestamptz not null default now(),
 paid_at timestamptz
);
create table if not exists public.poster_payment_events(
 event_id text primary key,
 order_id text not null,
 payment_id text not null,
 received_at timestamptz not null default now()
);
alter table public.poster_jobs enable row level security;
alter table public.poster_payment_events enable row level security;
revoke all on public.poster_jobs,public.poster_payment_events from anon,authenticated;
grant select,insert,update on public.poster_jobs to service_role;
grant select,insert on public.poster_payment_events to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('poster-originals','poster-originals',false,20000000,array['image/png'])
on conflict (id) do update set public=false;
create or replace function public.poster_mark_paid(p_order_id text,p_payment_id text,p_event_id text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_job public.poster_jobs%rowtype;
begin
 select * into v_job from public.poster_jobs where order_id=p_order_id for update;
 if not found or v_job.amount_paise is null then return false; end if;
 if v_job.payment_id is not null and v_job.payment_id <> p_payment_id then return false; end if;
 insert into public.poster_payment_events(event_id,order_id,payment_id)
 values(p_event_id,p_order_id,p_payment_id)
 on conflict(event_id) do nothing;
 update public.poster_jobs
 set status='paid',payment_id=p_payment_id,paid_at=coalesce(paid_at,now())
 where id=v_job.id;
 return true;
end
$$;
revoke all on function public.poster_mark_paid(text,text,text) from public,anon,authenticated;
grant execute on function public.poster_mark_paid(text,text,text) to service_role;
