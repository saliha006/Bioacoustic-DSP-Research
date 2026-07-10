"""Batch pipeline: cut before/during/after clips + spectrograms from BirdNET
detections, upload the files to Cloudflare R2, and insert a metadata row
(with R2 URLs) into Supabase for the review app.

Streams the source recording — seeks and reads only the samples needed for
each clip — so multi-GB recordings are never loaded into memory. Only
processes species at/below --confidence-threshold, since those are what
actually need expert review (and it keeps Supabase Storage usage bounded).

Usage:
    python process_detections.py \
        --recording ../recordings/243B1F02648873F9_20260412_031500.WAV \
        --results   ../findings/243B1F02648873F9_20260412_031500-findings/20260412_031500_54.947394_-1.700792.BirdNET.results.csv \
        --summary   ../findings/243B1F02648873F9_20260412_031500-findings/20260412_031500_54.947394_-1.700792.BirdNET.summary_by_species.csv \
        --confidence-threshold 0.7 \
        --limit 5 \
        --dry-run
"""

import argparse
import io
import os
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import librosa
import librosa.display
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import soundfile as sf
from dotenv import load_dotenv

CLIP_PADDING_S = 2.0  # length of the before/after context clips, in seconds


def recording_id_from_path(path):
    return Path(path).stem


def cut_clip(sound_file, sr, start_s, end_s):
    """Seek + read only the frames needed for this clip."""
    start_frame = max(0, int(start_s * sr))
    end_frame = min(len(sound_file), int(end_s * sr))
    if end_frame <= start_frame:
        return np.zeros(0, dtype="float32")
    sound_file.seek(start_frame)
    return sound_file.read(end_frame - start_frame, dtype="float32")


def make_spectrogram_png(y, sr):
    fig, ax = plt.subplots(figsize=(4, 2), dpi=100)
    ax.axis("off")
    if len(y) > 0:
        s = librosa.amplitude_to_db(np.abs(librosa.stft(y)), ref=np.max)
        librosa.display.specshow(s, sr=sr, x_axis="time", y_axis="hz", ax=ax)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0)
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def clip_to_ogg_bytes(y, sr):
    buf = io.BytesIO()
    sf.write(buf, y, sr, format="OGG", subtype="VORBIS")
    buf.seek(0)
    return buf.read()


def build_r2_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def upload_to_r2(r2_client, bucket, public_url_base, path, data, content_type):
    r2_client.put_object(Bucket=bucket, Key=path, Body=data, ContentType=content_type)
    return f"{public_url_base}/{path}"


def build_supabase_client():
    from supabase import create_client

    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def process_recording(recording_path, results_csv, summary_csv,
                       confidence_threshold, limit, dry_run):
    recording_id = recording_id_from_path(recording_path)
    summary = pd.read_csv(summary_csv)
    results = pd.read_csv(results_csv)

    # BirdNET's non-species classes (Engine, Siren, Human vocal, etc.) have no
    # real scientific name — their "Scientific name" column just repeats the
    # common name, unlike an actual species' Latin binomial. Skip those.
    is_real_species = summary["Scientific name"] != summary["Common name"]
    reviewable = summary[is_real_species & (summary["Mean confidence"] <= confidence_threshold)]
    if limit:
        reviewable = reviewable.head(limit)

    skipped_non_species = (~is_real_species).sum()
    print(f"{recording_id}: {len(summary)} species total ({skipped_non_species} non-species "
          f"classes skipped), {len(reviewable)} at/below confidence {confidence_threshold} "
          f"({'first ' + str(limit) if limit else 'all reviewable'})")

    if dry_run:
        supabase = r2 = bucket = public_url_base = None
        already_uploaded = set()
    else:
        load_dotenv()
        supabase = build_supabase_client()
        r2 = build_r2_client()
        bucket = os.environ["R2_BUCKET"]
        public_url_base = os.environ["R2_PUBLIC_URL_BASE"]

        existing = (
            supabase.table("detections")
            .select("species_scientific_name")
            .eq("recording_id", recording_id)
            .execute()
        )
        already_uploaded = {row["species_scientific_name"] for row in existing.data}

    with sf.SoundFile(str(recording_path)) as f:
        sr = f.samplerate

        for _, species_row in reviewable.iterrows():
            species_scientific = species_row["Scientific name"]
            species_common = species_row["Common name"]
            mean_confidence = float(species_row["Mean confidence"])
            capture_count = int(species_row["Detections"])

            if species_scientific in already_uploaded:
                print(f"  skipping {species_common} ({species_scientific}): already in Supabase")
                continue

            matches = results[results["Scientific name"] == species_scientific]
            if matches.empty:
                continue
            detection = matches.iloc[0]
            start_s, end_s = float(detection["Start (s)"]), float(detection["End (s)"])

            during = cut_clip(f, sr, start_s, end_s)
            before = cut_clip(f, sr, start_s - CLIP_PADDING_S, start_s)
            after = cut_clip(f, sr, end_s, end_s + CLIP_PADDING_S)
            spectrogram_png = make_spectrogram_png(during, sr)

            if dry_run:
                print(f"  [dry-run] {species_common} ({species_scientific}): "
                      f"before={len(before) / sr:.1f}s during={len(during) / sr:.1f}s "
                      f"after={len(after) / sr:.1f}s spectrogram={len(spectrogram_png)}B")
                continue

            slug = species_scientific.lower().replace(" ", "-")
            base_path = f"{recording_id}/{slug}"

            before_url = upload_to_r2(r2, bucket, public_url_base, f"{base_path}/before.ogg",
                                       clip_to_ogg_bytes(before, sr), "audio/ogg")
            during_url = upload_to_r2(r2, bucket, public_url_base, f"{base_path}/during.ogg",
                                       clip_to_ogg_bytes(during, sr), "audio/ogg")
            after_url = upload_to_r2(r2, bucket, public_url_base, f"{base_path}/after.ogg",
                                      clip_to_ogg_bytes(after, sr), "audio/ogg")
            spectrogram_url = upload_to_r2(r2, bucket, public_url_base, f"{base_path}/spectrogram.png",
                                            spectrogram_png, "image/png")

            supabase.table("detections").insert({
                "recording_id": recording_id,
                "species_scientific_name": species_scientific,
                "species_common_name": species_common,
                "mean_confidence": mean_confidence,
                "capture_count": capture_count,
                "clip_duration_s": end_s - start_s,
                "before_clip_url": before_url,
                "during_clip_url": during_url,
                "after_clip_url": after_url,
                "spectrogram_url": spectrogram_url,
                "review_status": "pending",
            }).execute()

            print(f"  uploaded {species_common} ({species_scientific})")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recording", required=True, help="Path to the source .WAV recording")
    parser.add_argument("--results", required=True, help="Path to *.BirdNET.results.csv")
    parser.add_argument("--summary", required=True, help="Path to *.BirdNET.summary_by_species.csv")
    parser.add_argument("--confidence-threshold", type=float, default=0.7,
                         help="Only process species at/below this mean confidence (default 0.7)")
    parser.add_argument("--limit", type=int, default=None,
                         help="Process only the first N reviewable species (small-subset testing)")
    parser.add_argument("--dry-run", action="store_true",
                         help="Compute clips/spectrograms but skip the R2 upload / Supabase insert")
    args = parser.parse_args()

    process_recording(args.recording, args.results, args.summary,
                       args.confidence_threshold, args.limit, args.dry_run)


if __name__ == "__main__":
    main()
