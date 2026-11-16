
create schema if not exists legacy_import;
revoke all on schema legacy_import from public, anon, authenticated;

create table if not exists legacy_import.accounts_base_content (
  id bigint primary key,
  created_at timestamp,
  expires_at timestamp,
  used smallint,
  user_id bigint,
  id_hash text
);

create table if not exists legacy_import.accounts_user (
  id bigint primary key,
  last_login timestamp,
  is_superuser smallint,
  username text,
  first_name text,
  last_name text,
  email text,
  is_staff smallint,
  is_active smallint,
  date_joined timestamp,
  profile_picture text,
  company text,
  bio text,
  phone text,
  created_at timestamp,
  updated_at timestamp,
  business_type text,
  city text,
  company_name text,
  company_registration_number text,
  country text,
  facebook_url text,
  genres text,
  instagram_url text,
  linkedin_url text,
  other_social_links text,
  rights_confirmation smallint,
  target_territories text,
  terms_accepted smallint,
  tiktok_url text,
  timezone text,
  user_subcategory text,
  website text,
  youtube_url text,
  user_type text
);

create table if not exists legacy_import.auth_permission (
  id bigint primary key,
  content_type_id bigint,
  codename text,
  name text
);

create table if not exists legacy_import.films_comment (
  source_row jsonb not null
);

create table if not exists legacy_import.films_film (
  id bigint primary key,
  title text,
  description text,
  content_type text,
  director text,
  producer text,
  "cast" text,
  duration integer,
  language text,
  country text,
  video_file text,
  poster text,
  trailer text,
  status text,
  created_at timestamp,
  updated_at timestamp,
  views_count bigint,
  budget numeric,
  rights_available smallint,
  distribution_territories text,
  uploaded_by_id bigint,
  uuid text,
  upload_approved smallint,
  upload_requested smallint,
  looking_only_paid_digital smallint,
  not_released_in_theatres smallint,
  plan_digital smallint,
  plan_global smallint,
  plan_ott smallint,
  plan_satellite smallint,
  release_date date
);

create table if not exists legacy_import.films_filmbuyermapping (
  id bigint primary key,
  mapped_at timestamp,
  notes text,
  is_active smallint,
  buyer_id bigint,
  film_id bigint,
  mapped_by_id bigint,
  allow_download smallint,
  download_requested smallint,
  allow_film_info_download smallint,
  allow_trailer_download smallint,
  film_info_requested smallint,
  trailer_download_requested smallint
);

create table if not exists legacy_import.films_filmdraft (
  id text primary key,
  main_video text,
  video_captions text,
  additional_languages jsonb,
  chapters jsonb,
  trailer text,
  title text,
  description text,
  content_type text,
  director text,
  producer text,
  "cast" text,
  duration integer,
  release_date date,
  language text,
  country text,
  tags jsonb,
  visibility text,
  age_rating text,
  poster text,
  thumbnail text,
  additional_images jsonb,
  distribution_territories text,
  budget numeric,
  rights_available smallint,
  licensing_terms text,
  script text,
  press_kit text,
  additional_documents jsonb,
  completed_tabs jsonb,
  current_tab text,
  created_at timestamp,
  updated_at timestamp,
  uploaded_by_id bigint,
  looking_only_paid_digital smallint,
  not_released_in_theatres smallint,
  plan_digital smallint,
  plan_global smallint,
  plan_ott smallint,
  plan_satellite smallint
);

create table if not exists legacy_import.films_payment (
  id bigint primary key,
  amount numeric,
  currency text,
  status text,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  receipt text,
  error_code text,
  error_description text,
  notes jsonb,
  created_at timestamp,
  updated_at timestamp,
  user_id bigint
);

create table if not exists legacy_import.films_status (
  id bigint primary key,
  file_name text,
  s3_key text,
  status text,
  created_at timestamp,
  updated_at timestamp,
  film_id bigint,
  file_type text
);

create table if not exists legacy_import.films_viewhistory (
  id bigint primary key,
  watched_at timestamp,
  watch_duration bigint,
  film_id bigint,
  user_id bigint
);

create index if not exists legacy_accounts_base_content_user_idx on legacy_import.accounts_base_content(user_id);
create index if not exists legacy_films_film_uploaded_by_idx on legacy_import.films_film(uploaded_by_id);
create index if not exists legacy_films_mapping_film_idx on legacy_import.films_filmbuyermapping(film_id);
create index if not exists legacy_films_mapping_buyer_idx on legacy_import.films_filmbuyermapping(buyer_id);
create index if not exists legacy_films_draft_uploaded_by_idx on legacy_import.films_filmdraft(uploaded_by_id);
create index if not exists legacy_films_payment_user_idx on legacy_import.films_payment(user_id);
create index if not exists legacy_films_status_film_idx on legacy_import.films_status(film_id);
create index if not exists legacy_films_viewhistory_film_idx on legacy_import.films_viewhistory(film_id);
create index if not exists legacy_films_viewhistory_user_idx on legacy_import.films_viewhistory(user_id);
