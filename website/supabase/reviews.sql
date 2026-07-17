-- Per-reviewer verdicts. One row per (detection, reviewer) so multiple experts
-- can review the same detection independently and resume where they left off.
-- Supersedes the single global detections.review_status column (kept for now,
-- but the app reads/writes verdicts here once auth is on).

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  detection_id uuid not null references detections (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id) on delete cascade,
  verdict text not null check (verdict in ('yes', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (detection_id, reviewer_id)
);

create index reviews_reviewer_idx on reviews (reviewer_id);
create index reviews_detection_idx on reviews (detection_id);

alter table reviews enable row level security;

-- A reviewer can only ever see, insert, or change their own rows.
create policy "Reviewers read own reviews"
  on reviews for select
  using (auth.uid() = reviewer_id);

create policy "Reviewers insert own reviews"
  on reviews for insert
  with check (auth.uid() = reviewer_id);

create policy "Reviewers update own reviews"
  on reviews for update
  using (auth.uid() = reviewer_id)
  with check (auth.uid() = reviewer_id);
