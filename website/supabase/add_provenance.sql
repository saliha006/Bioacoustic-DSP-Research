-- Full provenance on every detection, so an approved card traces all the way
-- back: site -> recording date -> the exact source WAV -> the exact seconds
-- within it. Today the pipeline computes start/end then drops them, and the row
-- only keeps recording_id, so a card resolves to the file but not the second.
--
-- All nullable on purpose: the original 75 cards were inserted without these and
-- should stay valid. Only new cards (from the 04 run onward) fill them in.
--
-- Time-of-day isn't stored separately -- it's recoverable from the WAV name's
-- HHMMSS plus start_s. Add recorded_at timestamptz later only if the UI wants it
-- directly.

alter table detections add column if not exists start_s          numeric;
alter table detections add column if not exists end_s            numeric;
alter table detections add column if not exists site             text;
alter table detections add column if not exists recording_date   date;
alter table detections add column if not exists source_recording text;
