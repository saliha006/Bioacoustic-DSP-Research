create table detections (
  id uuid primary key default gen_random_uuid(),
  recording_id text not null,
  species_scientific_name text not null,
  species_common_name text not null,
  mean_confidence numeric not null,
  capture_count integer not null,
  clip_duration_s numeric not null,
  before_clip_url text not null,
  during_clip_url text not null,
  after_clip_url text not null,
  spectrogram_url text not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'yes', 'no')),
  created_at timestamptz not null default now()
);

create index detections_species_idx on detections (species_scientific_name);
create index detections_review_status_idx on detections (review_status);

create table example_calls (
  id uuid primary key default gen_random_uuid(),
  species_scientific_name text not null,
  category text not null check (category in ('song', 'call', 'warning')),
  audio_url text not null,
  created_at timestamptz not null default now()
);

create index example_calls_species_idx on example_calls (species_scientific_name);
