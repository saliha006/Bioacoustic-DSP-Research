"""One-off: regenerate spectrogram PNGs for detections already in Supabase,
using the (now grayscale) make_spectrogram_png(), and re-upload to the same
R2 key so existing URLs keep working.

Re-derives the spectrogram from each row's already-uploaded during.ogg clip
(not the source recording), so it works even if the raw .WAV isn't at hand.

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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                         help="Regenerate in memory but skip the R2 re-upload")
    args = parser.parse_args()

    load_dotenv()
    supabase = build_supabase_client()
    r2 = build_r2_client()
    bucket = os.environ["R2_BUCKET"]
    public_url_base = os.environ["R2_PUBLIC_URL_BASE"]

    rows = (
        supabase.table("detections")
        .select("id, recording_id, species_common_name, during_clip_url, spectrogram_url")
        .execute()
        .data
    )
    print(f"{len(rows)} detections to regenerate")

    for row in rows:
        during_key = r2_key_from_url(row["during_clip_url"], public_url_base)
        spectrogram_key = r2_key_from_url(row["spectrogram_url"], public_url_base)

        obj = r2.get_object(Bucket=bucket, Key=during_key)
        during_bytes = obj["Body"].read()
        y, sr = sf.read(io.BytesIO(during_bytes), dtype="float32")

        spectrogram_png = make_spectrogram_png(y, sr)

        label = f"{row['recording_id']}/{row['species_common_name']}"
        if args.dry_run:
            print(f"  [dry-run] {label}: regenerated spectrogram={len(spectrogram_png)}B "
                  f"-> {spectrogram_key}")
            continue

        r2.put_object(Bucket=bucket, Key=spectrogram_key, Body=spectrogram_png,
                       ContentType="image/png")
        print(f"  re-uploaded {label} -> {spectrogram_key}")


if __name__ == "__main__":
    main()
