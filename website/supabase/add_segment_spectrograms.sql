-- Each detection now carries a spectrogram for all three clips (before/during/
-- after) so the image can switch with the segment tab, not just the audio.
-- The existing spectrogram_url stays as the "during" image; these two are added
-- for the other segments. Nullable so old rows stay valid until backfilled by
-- pipeline/regenerate_spectrograms.py.

alter table detections add column if not exists before_spectrogram_url text;
alter table detections add column if not exists after_spectrogram_url text;
