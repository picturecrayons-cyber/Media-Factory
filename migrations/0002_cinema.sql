create table if not exists titles (
  id text primary key,
  slug text unique not null,
  title text not null,
  director text,
  cast_names text,
  synopsis text not null default '',
  description text not null default '',
  content_type text not null default 'Film',
  language text not null default 'Malayalam',
  year int not null default 2024,
  duration_minutes int not null default 90,
  maturity_rating text not null default 'U',
  status text not null default 'DRAFT',
  access_tier text not null default 'SVOD',
  published boolean not null default false,
  featured boolean not null default false,
  is_original boolean not null default true,
  is_tvod_enabled boolean not null default true,
  tvod_rental_price int not null default 79,
  tvod_purchase_price int not null default 249,
  poster_path text not null,
  backdrop_path text not null,
  hls_ready boolean not null default true,
  genres text not null default 'Drama'
);

create table if not exists profiles (
  id text primary key,
  user_id text not null,
  name text not null,
  kind text not null default 'adult',
  is_active boolean not null default false,
  pin text not null default '0000',
  created_at timestamptz not null default now()
);
create index if not exists profiles_user_id_idx on profiles (user_id);

create table if not exists watchlist (
  user_id text not null,
  title_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);

create table if not exists subscriptions (
  id serial primary key,
  user_id text not null,
  plan_key text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on subscriptions (user_id);

create table if not exists entitlements (
  id serial primary key,
  user_id text not null,
  title_id text not null,
  access_type text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists entitlements_user_id_idx on entitlements (user_id);

create table if not exists submissions (
  id serial primary key,
  user_id text not null,
  title text not null,
  title_ml text,
  language text,
  email text,
  banner text,
  screener_url text,
  rights_type text,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

create table if not exists config_revisions (
  id serial primary key,
  user_id text not null,
  payload text not null,
  created_at timestamptz not null default now()
);

create table if not exists platform_meta (
  key text primary key,
  value text not null
);

create table if not exists revenue_events (
  id serial primary key,
  user_id text not null,
  kind text not null,
  title_id text,
  amount_inr int not null,
  created_at timestamptz not null default now()
);

insert into platform_meta (key, value) values
  ('last_sync', ''),
  ('connected', '1')
on conflict (key) do nothing;

insert into titles (
  id, slug, title, director, cast_names, synopsis, description, content_type, language, year,
  duration_minutes, maturity_rating, status, access_tier, published, featured, is_original,
  is_tvod_enabled, tvod_rental_price, tvod_purchase_price, poster_path, backdrop_path, hls_ready, genres
) values
  ('jananam-1947-pranayam-thudarunnu','jananam-1947-pranayam-thudarunnu','Jananam 1947 Pranayam Thudarunnu','Abijith Asokan','Kozhikode Jayaraj, Leela Samson','A poignant Malayalam drama tracing love, aging, dignity, and companionship late in life.','An acclaimed Crayons Original exploring an elderly couple’s delicate bond, resilience, and unconditional companionship.','Film','Malayalam',2024,115,'U','PUBLISHED','TVOD',true,true,true,true,79,249,'/posters/jananam.jpg','/backdrops/jananam.jpg',true,'Drama,Crayons Original,Festival'),
  ('pranayam-1947','pranayam-1947','PRANAYAM 1947 (Telugu)','Abijith Asokan','Kozhikode Jayaraj, Leela Samson','Telugu master presentation of the same late-life love story.','An elderly couple’s delicate bond — Telugu master.','Film','Telugu',2024,106,'U','PUBLISHED','SVOD',true,true,true,true,79,249,'/posters/pranayam-1947.jpg','/backdrops/jananam.jpg',true,'Drama,Telugu,Festival'),
  ('alis-nature','alis-nature','Ali''s Nature',null,null,'A deep environmental journey into human instinct, raw nature, and ecological harmony.','Solitude and the untamed beauty of landscape through Ali’s eyes.','Film','Malayalam',2024,87,'U','DRAFT','SVOD',false,false,true,true,79,249,'/posters/alis-nature.jpg','/posters/alis-nature.jpg',true,'Nature,Indie'),
  ('bahumukham','bahumukham','Bahumukham — Good, Bad & The Actor',null,null,'A psychological suspense drama following an actor confronting ambition, identity, and inner demons.','The fracture of an artist driven to extremes.','Film','Malayalam',2024,87,'U/A 16+','DRAFT','SVOD',false,true,true,true,79,249,'/posters/bahumukham.jpg','/posters/bahumukham.jpg',true,'Thriller,Psychological'),
  ('shri-balaji-photo-studio','shri-balaji-photo-studio','Shri Balaji Photo Studio',null,null,'A small-town photo studio capturing generations of untold stories, joy, and memory.','Love and friendship around a quaint local studio.','Film','Malayalam',2023,147,'U','DRAFT','SVOD',false,false,true,true,79,249,'/posters/shri-balaji-photo-studio.jpg','/posters/shri-balaji-photo-studio.jpg',true,'Drama,Nostalgia'),
  ('aandaal','aandaal','Aandaal',null,null,'Resilience, tradition, and devotion against a changing social landscape.','Faith, family legacy, and womanhood.','Film','Malayalam',2024,115,'U','DRAFT','SVOD',false,false,true,true,79,249,'/posters/aandaal.jpg','/posters/aandaal.jpg',true,'Drama,Faith'),
  ('imran-3-185','imran-3-185','Imran 3:185',null,null,'A cinematic reflection on fate, destiny, and the impermanence of mortal life.','A meditative Malayalam film with stark visual composition.','Film','Malayalam',2024,110,'U/A','DRAFT','SVOD',false,false,true,true,79,249,'/posters/imran-3-185.jpg','/posters/imran-3-185.jpg',true,'Meditation,Drama'),
  ('kombal','kombal','Kombal',null,null,'A raw Kerala drama on the wild edge of rural culture, forest lore, and survival.','Instinct, land, and human will.','Short Film','Malayalam',2024,19,'U','DRAFT','FREE',false,false,true,false,79,249,'/posters/kombal.jpg','/posters/kombal.jpg',true,'Short,Rural'),
  ('jamalinte-punchiri','jamalinte-punchiri','Jamalinte Punchiri (Jamal''s Smile)',null,null,'Optimism, quirks, and resilience of Jamal in a close-knit coastal hamlet.','A social comedy-drama celebrating local spirit.','Film','Malayalam',2024,138,'U','DRAFT','SVOD',false,false,true,true,79,249,'/posters/jamalinte-punchiri.jpg','/posters/jamalinte-punchiri.jpg',true,'Comedy,Family'),
  ('the-second-home','the-second-home','The Second Home',null,null,'Childhood, school days, and the bittersweet transition of growing up in Kerala.','Youthful friendships, classrooms, and innocence.','Short Film','Malayalam',2024,8,'U','DRAFT','FREE',false,false,true,false,79,249,'/posters/the-second-home.jpg','/posters/the-second-home.jpg',true,'Short,Kids,Family'),
  ('ama','ama','Ama',null,null,'A poetic tribute to motherhood woven through minimal dialogue and natural light.','Silent sacrifice, maternal affection, and peace.','Short Film','Malayalam',2024,7,'U','DRAFT','FREE',false,false,true,false,79,249,'/posters/ama.jpg','/posters/ama.jpg',true,'Short,Kids,Family')
on conflict (id) do nothing;
