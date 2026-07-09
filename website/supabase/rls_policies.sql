alter table detections enable row level security;
alter table example_calls enable row level security;

-- Anyone with the anon key can read detections (needed for the review app to list them)
create policy "Public read access to detections"
  on detections for select
  using (true);

-- Anyone with the anon key can update review_status (yes/no buttons).
-- No auth system yet since this is a single-reviewer internal tool for now.
create policy "Public review status updates"
  on detections for update
  using (true)
  with check (true);

-- Reference calls are read-only for the frontend; only the pipeline (service_role) inserts them
create policy "Public read access to example_calls"
  on example_calls for select
  using (true);
