-- Crayons Bridge: rights taxonomy foundation.
-- Deliberately not applied to the shared Supabase project by this change.
-- RLS is enabled with no client policies: access is server-only until explicit
-- admin authorization and API handlers are implemented and tested.

create table if not exists public.bridge_rights_categories (
  code text primary key,
  family text not null check (family in ('LINEAR', 'NON_LINEAR', 'ANCILLARY', 'DERIVATIVE', 'TECHNICAL')),
  label text not null,
  description text not null default '',
  buyer_types text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.bridge_title_rights (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.bridge_titles(id) on delete restrict,
  category_code text not null references public.bridge_rights_categories(code) on delete restrict,
  evidence_status text not null default 'MISSING'
    check (evidence_status in ('MISSING','PENDING_REVIEW','VERIFIED','REJECTED','DISPUTED')),
  availability_status text not null default 'UNKNOWN'
    check (availability_status in ('UNKNOWN','AVAILABLE','PARTIALLY_AVAILABLE','COMMITTED','RESTRICTED','EXPIRED')),
  exclusivity text not null default 'UNSPECIFIED'
    check (exclusivity in ('UNSPECIFIED','EXCLUSIVE','NON_EXCLUSIVE')),
  monetisation_models text[] not null default '{}',
  transmission_modes text[] not null default '{}',
  start_date date,
  end_date date,
  premiere_window text,
  permitted_plays integer check (permitted_plays is null or permitted_plays >= 0),
  restrictions jsonb not null default '{}'::jsonb,
  buyer_visible_summary text,
  internal_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists bridge_title_rights_title_idx
  on public.bridge_title_rights(title_id);
create index if not exists bridge_title_rights_discovery_idx
  on public.bridge_title_rights(category_code, availability_status, evidence_status);

create table if not exists public.bridge_title_right_territories (
  title_right_id uuid not null references public.bridge_title_rights(id) on delete cascade,
  territory_code text not null,
  territory_label text not null,
  scope_type text not null default 'COUNTRY'
    check (scope_type in ('COUNTRY','REGION','WORLDWIDE','CUSTOM')),
  primary key (title_right_id, territory_code)
);

create table if not exists public.bridge_title_right_languages (
  title_right_id uuid not null references public.bridge_title_rights(id) on delete cascade,
  language_code text not null,
  language_label text not null,
  language_scope text not null
    check (language_scope in ('ORIGINAL_AUDIO','DUBBED_AUDIO','SUBTITLES','ACCESSIBILITY','ALL_PERMITTED')),
  primary key (title_right_id, language_code, language_scope)
);

create table if not exists public.bridge_rights_evidence (
  id uuid primary key default gen_random_uuid(),
  title_right_id uuid not null references public.bridge_title_rights(id) on delete cascade,
  evidence_type text not null
    check (evidence_type in ('CONTRACT','ASSIGNMENT','CLEARANCE','AMENDMENT','EMAIL_CONFIRMATION','LEGAL_REVIEW','OTHER')),
  storage_reference text,
  document_hash text,
  source_rightsholder text,
  effective_date date,
  expiry_date date,
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW','VERIFIED','REJECTED','DISPUTED','SUPERSEDED')),
  reviewed_by text,
  reviewed_at timestamptz,
  confidential boolean not null default true,
  notes text,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (expiry_date is null or effective_date is null or expiry_date >= effective_date)
);

create table if not exists public.bridge_rights_commitments (
  id uuid primary key default gen_random_uuid(),
  title_right_id uuid not null references public.bridge_title_rights(id) on delete restrict,
  deal_id uuid references public.bridge_deals(id) on delete restrict,
  commitment_type text not null
    check (commitment_type in ('SIGNED_LICENSE','HOLD_BACK','OPTION','EXISTING_GRANT','DISPUTE','OTHER')),
  status text not null default 'ACTIVE'
    check (status in ('PENDING','ACTIVE','EXPIRED','TERMINATED','DISPUTED')),
  territory_codes text[] not null default '{}',
  language_codes text[] not null default '{}',
  start_date date,
  end_date date,
  exclusivity text not null default 'UNSPECIFIED'
    check (exclusivity in ('UNSPECIFIED','EXCLUSIVE','NON_EXCLUSIVE')),
  source_reference text,
  notes text,
  recorded_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists bridge_rights_commitments_right_idx
  on public.bridge_rights_commitments(title_right_id, status, start_date, end_date);

create table if not exists public.bridge_buyer_requirements (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id text not null references public.bridge_profiles(user_id) on delete restrict,
  name text not null,
  category_codes text[] not null default '{}',
  territory_codes text[] not null default '{}',
  language_codes text[] not null default '{}',
  monetisation_models text[] not null default '{}',
  exclusivity_preference text not null default 'ANY'
    check (exclusivity_preference in ('ANY','EXCLUSIVE','NON_EXCLUSIVE')),
  earliest_start_date date,
  minimum_term_days integer check (minimum_term_days is null or minimum_term_days >= 0),
  technical_requirements jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bridge_buyer_requirements_buyer_idx
  on public.bridge_buyer_requirements(buyer_user_id, active);

-- The catalog is controlled vocabulary, not a claim that any title owns these rights.
insert into public.bridge_rights_categories (code, family, label, description, buyer_types, sort_order) values
('THEATRICAL_FIRST_RUN','LINEAR','Theatrical — first run','First-run cinema exhibition.','{cinema_chain,theatrical_distributor,independent_exhibitor}',10),
('THEATRICAL_RERELEASE','LINEAR','Theatrical — re-release / revival','Re-release, revival and repertory exhibition.','{cinema_chain,theatrical_distributor,independent_exhibitor}',11),
('TV_FREE_TO_AIR','LINEAR','Television — free-to-air','Scheduled free-to-air broadcast.','{broadcaster,channel_group}',20),
('TV_PAY_TV','LINEAR','Television — pay TV','Scheduled subscription or premium channel exhibition.','{pay_tv_operator,broadcaster}',21),
('SATELLITE_CARRIAGE','LINEAR','Satellite transmission','Specified satellite transmission rights.','{satellite_broadcaster,channel_operator}',22),
('CABLE_CARRIAGE','LINEAR','Cable carriage','Specified cable carriage or channel rights.','{cable_operator,broadcaster}',23),
('TV_PREMIERE_WINDOW','LINEAR','Television premiere / window','Premiere, first-window and holdback rights.','{broadcaster,distributor}',24),
('TV_REPEAT_TELECAST','LINEAR','Repeat telecast','Repeat plays, count and permitted period.','{broadcaster,channel_operator}',25),
('FAST_SCHEDULED_CHANNEL','LINEAR','FAST scheduled channel','Scheduled ad-supported streaming channel.','{fast_platform,channel_aggregator}',26),
('PROGRAMMED_EVENT','LINEAR','Live / programmed event','Scheduled special presentation where expressly permitted.','{event_organiser,exhibitor,platform}',27),
('SVOD','NON_LINEAR','SVOD','On-demand access included in a subscription service.','{ott_platform,subscription_service}',40),
('TVOD_RENTAL','NON_LINEAR','TVOD — rental','Transactional rental with defined playback rules.','{transactional_video_platform,digital_store}',41),
('EST_DIGITAL_PURCHASE','NON_LINEAR','EST / digital purchase','Permitted digital purchase or electronic sell-through.','{digital_store,transactional_platform}',42),
('AVOD_ON_DEMAND','NON_LINEAR','AVOD — on-demand','Ad-supported on-demand streaming.','{avod_platform,streaming_service}',43),
('BVOD_CATCHUP','NON_LINEAR','BVOD / catch-up','Broadcaster VOD, catch-up and catalogue service.','{broadcaster,bvod_service}',44),
('PREMIUM_VOD','NON_LINEAR','Premium VOD','Premium-priced on-demand window.','{transactional_platform,distributor}',45),
('TVOD_PAY_PER_VIEW','NON_LINEAR','Pay-per-view','Paid access to a specific title or event.','{ppv_operator,platform}',46),
('FAST_CATALOGUE_VOD','NON_LINEAR','FAST / channel-linked VOD','Separate on-demand rights associated with a channel service.','{fast_platform,channel_operator}',47),
('DOWNLOAD_OFFLINE','NON_LINEAR','Download / offline access','Time-limited or permanent offline access as expressly licensed.','{digital_platform,mobile_platform}',48),
('MOBILE_APP_STREAMING','NON_LINEAR','Mobile / app streaming','Device/app delivery method; not a separate right unless contracted.','{ott_platform,telecom_operator}',49),
('WEB_CONNECTED_TV','NON_LINEAR','Web / connected TV','Browser and connected-device delivery method.','{ott_platform,device_ecosystem}',50),
('CLOUD_MANAGED_STREAMING','NON_LINEAR','Cloud / managed streaming','Authorised service-provider delivery.','{enterprise_video_platform,authorised_distributor}',51),
('AIRLINE_IFE','ANCILLARY','Airline in-flight entertainment','In-flight exhibition and route/aircraft scope.','{airline,ife_aggregator}',60),
('HOTEL_ENTERTAINMENT','ANCILLARY','Hotel entertainment','Hotel-room systems and hotel networks.','{hotel_group,hotel_content_aggregator}',61),
('TRANSPORT_NON_THEATRICAL','ANCILLARY','Cruise / ferry / transport','Non-theatrical transport exhibition.','{transport_operator,specialist_distributor}',62),
('EDUCATIONAL_SCREENING','ANCILLARY','Educational / campus screening','Institutional screenings and campus use.','{educational_institution,educational_network}',63),
('CORPORATE_INSTITUTIONAL','ANCILLARY','Corporate / institutional screening','Employee, hospital and other institutional exhibition.','{corporate,healthcare_network,institutional_distributor}',64),
('PUBLIC_SPECIAL_SCREENING','ANCILLARY','Public / festival / cultural screening','Ticketed special, community, festival, museum or archive screening.','{festival,cultural_organisation,exhibitor}',65),
('TRAILER_PROMO','ANCILLARY','Trailer / promotional assets','Approved trailers, teasers, EPK and artwork use.','{broadcaster,distributor,platform,marketing_agency}',70),
('CLIP_LICENSING','ANCILLARY','Film clips / excerpts','Defined clip length, context, channels and term.','{broadcaster,media_publisher,platform}',71),
('SOUNDTRACK_ALBUM','ANCILLARY','Soundtrack album / score','Only the music rights actually controlled and cleared.','{music_label,audio_platform,publisher}',72),
('AUDIO_ONLY_EXCERPTS','ANCILLARY','Audio-only excerpts','Audio excerpts and promotional music use.','{audio_platform,publisher,distributor}',73),
('REMAKE','DERIVATIVE','Remake rights','Separate underlying-work and adaptation chain-of-title required.','{production_company,studio,broadcaster}',80),
('SEQUEL_PREQUEL','DERIVATIVE','Sequel / prequel rights','Separate ownership and approvals required.','{production_company,studio,broadcaster}',81),
('SPINOFF_CHARACTER','DERIVATIVE','Spin-off / character-based rights','Character and underlying-IP permissions must be established.','{studio,production_company,interactive_business}',82),
('FORMAT_ADAPTATION','DERIVATIVE','Format / localisation adaptation','Authorised format and adaptation rights.','{production_company,broadcaster,publisher}',83),
('INTERACTIVE_GAME','DERIVATIVE','Interactive / game adaptation','Game and interactive exploitation rights.','{game_studio,interactive_business}',84),
('MERCHANDISING','DERIVATIVE','Merchandising / commercial exploitation','Title, trademark, character, artwork and likeness rights are separate.','{consumer_products_licensee,publisher,brand,retailer}',85),
('PUBLISHING','DERIVATIVE','Publishing / companion books','Authorised publishing and companion-material rights.','{publisher,retailer}',86),
('REMASTER_RESTORATION','TECHNICAL','Remaster / restoration','Technical processing permission is not publication permission.','{restoration_specialist,archive,distributor}',90),
('DUBBING_SUBTITLING','TECHNICAL','Dubbing / subtitling','Authorised localisation and language-version creation.','{localisation_company,distributor,broadcaster}',91),
('ACCESSIBILITY_VERSION','TECHNICAL','Accessibility versions','Audio description, captions and accessibility deliverables.','{accessibility_provider,distributor,broadcaster}',92),
('TERRITORY_EDIT','TECHNICAL','Territory-specific edit','Censorship/compliance edits only when authorised.','{distributor,broadcaster,localisation_company}',93),
('ARCHIVE_PRESERVATION','TECHNICAL','Archive / preservation access','Storage and preservation permission distinct from exploitation.','{archive,library,research_institution}',94)
on conflict (code) do update set
  family = excluded.family,
  label = excluded.label,
  description = excluded.description,
  buyer_types = excluded.buyer_types,
  sort_order = excluded.sort_order,
  active = true;

alter table public.bridge_rights_categories enable row level security;
alter table public.bridge_title_rights enable row level security;
alter table public.bridge_title_right_territories enable row level security;
alter table public.bridge_title_right_languages enable row level security;
alter table public.bridge_rights_evidence enable row level security;
alter table public.bridge_rights_commitments enable row level security;
alter table public.bridge_buyer_requirements enable row level security;
