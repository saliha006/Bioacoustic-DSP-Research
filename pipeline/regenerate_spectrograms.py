"""Backfill: regenerate every detection's spectrograms from the clips already on
R2, at the current (higher) resolution, and add the before/after spectrograms
that older rows are missing.

Reads each row's before/during/after .ogg from R2 (not the source .WAV, which may
not be at hand), renders a spectrogram for each, and re-uploads:
  - during  -> the existing spectrogram.png key (URL unchanged, just sharper)
  - before  -> before-spectrogram.png   (new)
  - after   -> after-spectrogram.png    (new)
then writes the two new URLs back to the row. Run add_segment_spectrograms.sql
first so those columns exist.

Usage:
    python regenerate_spectrograms.py [--dry-run]
"""

import argparse
import io
import os

import soundfile as sf
from dotenv import load_dotenv

from process_detections import build_r2_client, build_supabase_client, make_spectrogram_png


def r2_key_from_url(url, public_url_base):
    prefix = public_url_base + "/"
    if not url.startswith(prefix):
        raise ValueError(f"URL {url!r} does not start with public base {public_url_base!r}")
    return url[len(prefix):]


def spectrogram_from_clip(r2, bucket, clip_key):
    obj = r2.get_object(Bucket=bucket, Key=clip_key)
    y, sr = sf.read(io.BytesIO(obj["Body"].read()), dtype="float32")
    return make_spectrogram_png(y, sr)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                         help="Render the spectrograms but skip the R2 upload and row update")
    args = parser.parse_args()

    load_dotenv()
    supabase = build_supabase_client()
    r2 = build_r2_client()
    bucket = os.environ["R2_BUCKET"]
    public_url_base = os.environ["R2_PUBLIC_URL_BASE"]

    rows = (
        supabase.table("detections")
        .select("id, recording_id, species_common_name, "
                "before_clip_url, during_clip_url, after_clip_url, spectrogram_url")
        .execute()
        .data
    )
    print(f"{len(rows)} detections to regenerate")

    for row in rows:
        during_spec_key = r2_key_from_url(row["spectrogram_url"], public_url_base)
        base_path = during_spec_key.rsplit("/", 1)[0]
        before_spec_key = f"{base_path}/before-spectrogram.png"
        after_spec_key = f"{base_path}/after-spectrogram.png"

        # spectrogram key -> the clip it's rendered from
        segments = {
            during_spec_key: r2_key_from_url(row["during_clip_url"], public_url_base),
            before_spec_key: r2_key_from_url(row["before_clip_url"], public_url_base),
            after_spec_key: r2_key_from_url(row["after_clip_url"], public_url_base),
        }
        rendered = {
            spec_key: spectrogram_from_clip(r2, bucket, clip_key)
            for spec_key, clip_key in segments.items()
        }

        label = f"{row['recording_id']}/{row['species_common_name']}"
        if args.dry_run:
            sizes = ", ".join(f"{k.rsplit('/', 1)[1]}={len(v)}B" for k, v in rendered.items())
            print(f"  [dry-run] {label}: {sizes}")
            continue

        for spec_key, png in rendered.items():
            r2.put_object(Bucket=bucket, Key=spec_key, Body=png, ContentType="image/png")

        supabase.table("detections").update({
            "before_spectrogram_url": f"{public_url_base}/{before_spec_key}",
            "after_spectrogram_url": f"{public_url_base}/{after_spec_key}",
        }).eq("id", row["id"]).execute()

        print(f"  regenerated {label} (3 spectrograms)")


if __name__ == "__main__":
    main()
