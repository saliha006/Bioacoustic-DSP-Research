"""Backfill: regenerate every detection's spectrograms from the clips already on
R2, at the current render quality, and point each row at the three images.

Renders a spectrogram for the before/during/after clip and uploads them under
fresh spec-before/during/after.png keys (fresh names so the browser/CDN can't
serve a stale cached copy), writes all three URLs back to the row, then deletes
the previous-generation keys. Reads from the .ogg clips on R2, not the source
.WAV, so it works even if the raw recording isn't at hand. Run
add_segment_spectrograms.sql first so the two segment columns exist.

Usage:
    python regenerate_spectrograms.py [--dry-run]
"""

import argparse
import io
import os

import soundfile as sf
from dotenv import load_dotenv

from process_detections import build_r2_client, build_supabase_client, make_spectrogram_png

SEGMENTS = ("before", "during", "after")


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
                         help="Render the spectrograms but skip the R2 writes and row update")
    args = parser.parse_args()

    load_dotenv()
    supabase = build_supabase_client()
    r2 = build_r2_client()
    bucket = os.environ["R2_BUCKET"]
    public_url_base = os.environ["R2_PUBLIC_URL_BASE"]

    rows = (
        supabase.table("detections")
        .select("id, recording_id, species_common_name, spectrogram_url, "
                "before_clip_url, during_clip_url, after_clip_url")
        .execute()
        .data
    )
    print(f"{len(rows)} detections to regenerate")

    for row in rows:
        base_path = r2_key_from_url(row["during_clip_url"], public_url_base).rsplit("/", 1)[0]
        rendered = {
            seg: spectrogram_from_clip(r2, bucket, r2_key_from_url(row[f"{seg}_clip_url"], public_url_base))
            for seg in SEGMENTS
        }

        label = f"{row['recording_id']}/{row['species_common_name']}"
        if args.dry_run:
            sizes = ", ".join(f"{seg}={len(png)}B" for seg, png in rendered.items())
            print(f"  [dry-run] {label}: {sizes}")
            continue

        new_keys = {seg: f"{base_path}/spec-{seg}.png" for seg in SEGMENTS}
        for seg, png in rendered.items():
            r2.put_object(Bucket=bucket, Key=new_keys[seg], Body=png, ContentType="image/png")

        supabase.table("detections").update({
            "spectrogram_url": f"{public_url_base}/{new_keys['during']}",
            "before_spectrogram_url": f"{public_url_base}/{new_keys['before']}",
            "after_spectrogram_url": f"{public_url_base}/{new_keys['after']}",
        }).eq("id", row["id"]).execute()

        # drop the previous-generation keys (never delete one we just wrote)
        stale_keys = {
            r2_key_from_url(row["spectrogram_url"], public_url_base),
            f"{base_path}/before-spectrogram.png",
            f"{base_path}/after-spectrogram.png",
        } - set(new_keys.values())
        for key in stale_keys:
            r2.delete_object(Bucket=bucket, Key=key)

        print(f"  regenerated {label} (3 spectrograms)")


if __name__ == "__main__":
    main()
