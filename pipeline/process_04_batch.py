"""Site-day driver for the 04 (June) recordings.

The 04 deployment is one ~1-minute WAV per minute, laid out as
Site N / YYYYMMDD / DEVICEID_YYYYMMDD_HHMMSS.WAV. Feeding each minute-file to the
per-recording pipeline would make one review card per species *per minute* and
flood the queue, so this driver groups a site's whole day into one session:
BirdNET runs over the day, detections are pooled, and each low-confidence species
gets ONE representative card whose provenance (site, date, source WAV, start/end
seconds) pins it back to the exact minute-file it was drawn from.

Time-boxed: it processes site-days in order until --minutes runs out, then records
exactly where it stopped in PROCESSING-PROGRESS.md so the next run resumes cleanly.
Re-running a partly-done day is safe -- species already carded for that site-day
are skipped (checked against Supabase).

Usage:
    python process_04_batch.py --site "Site 4" --minutes 20
    python process_04_batch.py --site "Site 4" --start-date 20260609   # resume
    python process_04_batch.py --site "Site 4" --minutes 5 --dry-run
"""

import argparse
import os
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import soundfile as sf
from dotenv import dotenv_values

from process_detections import (
    CLIP_PADDING_S,
    build_r2_client,
    build_supabase_client,
    emit_detection,
)

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# Online-only OneDrive placeholders; reading/copying a file materialises it.
ONEDRIVE_04 = Path(
    r"C:\Users\Salih\Northumbria University - Production Azure AD"
    r"\AHRC - Kittiwakes and Urban Environment - 04 Recordings (0606-2606)"
)
JUNK_DATE = "19700101"  # corrupt AudioMoth clock artifact -- skip these folders

# BirdNET lives in its own venv under processing/ (kept out of the pipeline venv).
# The original .venv-birdnet (2.4.0) is broken (a setuptools/_distutils_hack clash
# stops birdnet_analyzer importing); .venv-birdnet-fresh (2.3.0) is the working one.
BIRDNET_PY = REPO / "processing" / "birdnet_analysis" / ".venv-birdnet-fresh" / "Scripts" / "python.exe"
WORK_ROOT = REPO / "processing" / "birdnet_analysis" / "birdnet_work_04"
RESULTS_ROOT = REPO / "processing" / "birdnet_analysis" / "birdnet_results_04"
LEDGER = HERE / "PROCESSING-PROGRESS.md"

MIN_CONF = 0.25  # BirdNET detection floor, matching the April runs
BIRDNET_LABEL = "2.3.0 (.venv-birdnet-fresh)"
# No lat/lon filter for this run (user's call): take everything BirdNET reports
# and card every real species at/below the threshold; geographic false positives
# get dealt with later.


def hydrate_copy(src, dst):
    """Copy a OneDrive online-only placeholder to a local path. shutil.copy2's
    Windows fast path (readinto) throws EINVAL on placeholders mid-hydration, so
    read the bytes plainly (which triggers the download) and write them out."""
    dst.write_bytes(Path(src).read_bytes())


def birdnet_week(date_iso):
    """BirdNET's 48-week-of-year value (4 weeks/month). April 12 -> 14, matching
    the logged April runs; derived per file so June gets its own season."""
    d = datetime.strptime(date_iso, "%Y-%m-%d")
    return (d.month - 1) * 4 + min(4, (d.day - 1) // 7 + 1)


def date_folders(site_dir, start_date):
    """Real recording dates for a site, in order, skipping the junk clock folder."""
    dates = []
    for child in sorted(site_dir.iterdir()):
        if not child.is_dir() or child.name == JUNK_DATE or not child.name.isdigit():
            continue
        if start_date and child.name < start_date:
            continue
        dates.append(child)
    return dates


def wavs_in(date_dir):
    return sorted(p for p in date_dir.iterdir() if p.suffix.upper() == ".WAV")


def stage_day(date_dir, work_dir, deadline, cap):
    """Copy the day's WAVs local (forces the OneDrive download) and grab each
    file's duration for the padding check later. Downloads file-by-file and stops
    if the time budget runs out mid-day, so a slow OneDrive can't blow past the
    budget during a 360-file download -- the day just gets processed partially and
    finished on the next run. Returns (durations, truncated)."""
    work_dir.mkdir(parents=True, exist_ok=True)
    durations = {}
    truncated = False
    for i, src in enumerate(wavs_in(date_dir)):
        if time.monotonic() >= deadline or (cap and i >= cap):
            truncated = True
            break
        dst = work_dir / src.name
        if not dst.exists():
            hydrate_copy(src, dst)
        durations[src.name] = sf.info(str(dst)).duration
    return durations, truncated


def run_birdnet(work_dir, out_dir, week):
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [str(BIRDNET_PY), "-m", "birdnet_analyzer.analyze", str(work_dir),
         "-o", str(out_dir), "--rtype", "csv",
         "--min_conf", str(MIN_CONF), "--week", str(week), "-t", "8", "-b", "8"],
        check=True,
    )


def pooled_detections(out_dir):
    """Read every per-file BirdNET results CSV in the day and pool the rows,
    tagging each with the source WAV it came from. BirdNET names outputs
    <stem>.BirdNET.results.csv; the matching recording is <stem>.WAV."""
    frames = []
    for csv_path in out_dir.glob("*.BirdNET.results.csv"):
        df = pd.read_csv(csv_path)
        if df.empty:
            continue
        df["source_recording"] = csv_path.name.replace(".BirdNET.results.csv", ".WAV")
        frames.append(df)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


def write_ledger(state):
    lines = [
        "# 04 Batch -- Processing Progress",
        "",
        "> Local resume ledger (this file is gitignored). Rewritten after every "
        "site-day so a mid-batch stop is always recoverable. Re-running a PARTIAL "
        "day is safe -- already-carded species are skipped.",
        "",
        f"- Batch: `04 Recordings (0606-2606)` / **{state['site']}**",
        "- Card granularity: one per species per **site-day**",
        f"- Card threshold: mean confidence <= {state['threshold']}",
        f"- BirdNET: {BIRDNET_LABEL}, min_conf {MIN_CONF}, week per-date, no lat/lon filter",
        f"- Started: {state['started']}  |  Last update: {now_iso()}",
        f"- Cards created this run: **{state['cards']}**",
        "",
        "## Site-days",
        "",
    ]
    for day in state["days"]:
        carded = ", ".join(day["species"]) if day["species"] else "none"
        lines.append(
            f"- **{day['date']}** -- {day['status']} -- {day['files']} files, "
            f"{len(day['species'])} carded ({carded}); {day['skipped']} already present"
        )
        if day.get("note"):
            lines.append(f"  - {day['note']}")
    lines += ["", "## Resume pointer", ""]
    lines.append(f"- {state['resume']}")
    lines.append(f"- Stop reason: {state['stop_reason']}")
    LEDGER.write_text("\n".join(lines) + "\n", encoding="utf-8")


def process_batch(site, minutes, threshold, start_date, max_cards,
                  max_files_per_day, dry_run):
    site_dir = ONEDRIVE_04 / site
    if not site_dir.is_dir():
        raise SystemExit(f"Site folder not found: {site_dir}")

    if dry_run:
        supabase = r2 = bucket = public_url_base = None
    else:
        env = dotenv_values(str(HERE / ".env"))
        os.environ.update({k: v for k, v in env.items() if v is not None})
        supabase = build_supabase_client()
        r2 = build_r2_client()
        bucket = os.environ["R2_BUCKET"]
        public_url_base = os.environ["R2_PUBLIC_URL_BASE"]

    deadline = time.monotonic() + minutes * 60
    state = {
        "site": site, "threshold": threshold, "started": now_iso(),
        "days": [], "cards": 0, "resume": "not started", "stop_reason": "",
    }

    for date_dir in date_folders(site_dir, start_date):
        date_name = date_dir.name
        date_iso = f"{date_name[:4]}-{date_name[4:6]}-{date_name[6:8]}"

        if time.monotonic() >= deadline:
            state["resume"] = f"Next: {site} / {date_name} (not yet started)"
            state["stop_reason"] = f"{minutes}-min time budget reached (clean day boundary)"
            write_ledger(state)
            break
        if state["cards"] >= max_cards:
            state["resume"] = f"Next: {site} / {date_name} (not yet started)"
            state["stop_reason"] = f"card cap {max_cards} reached"
            write_ledger(state)
            break

        print(f"\n=== {site} / {date_name} ===")
        work_dir = WORK_ROOT / site / date_name
        out_dir = RESULTS_ROOT / site / date_name
        durations, truncated = stage_day(date_dir, work_dir, deadline, max_files_per_day)

        if not durations:  # deadline hit before a single file downloaded
            state["resume"] = f"Next: {site} / {date_name} (not yet started)"
            state["stop_reason"] = f"{minutes}-min time budget reached during staging"
            write_ledger(state)
            break

        run_birdnet(work_dir, out_dir, birdnet_week(date_iso))
        pooled = pooled_detections(out_dir)

        total_files = len(wavs_in(date_dir))
        day = {"date": date_name, "status": "PARTIAL" if truncated else "DONE",
               "files": f"{len(durations)}/{total_files}" if truncated else len(durations),
               "species": [], "skipped": 0, "note": ""}
        if truncated:
            day["note"] = "day truncated by time budget; re-run resumes it (carded species skipped)"
        state["days"].append(day)

        if pooled.empty:
            day["note"] = "no detections"
            write_ledger(state)
            continue

        # real species only (BirdNET's Engine/Siren/Human classes repeat the
        # common name where a real species has a Latin binomial), pooled to a
        # per-species day summary, kept if the mean confidence is review-worthy.
        pooled = pooled[pooled["Scientific name"] != pooled["Common name"]]
        summary = (
            pooled.groupby(["Scientific name", "Common name"])
            .agg(mean_conf=("Confidence", "mean"), count=("Confidence", "size"))
            .reset_index()
        )
        reviewable = summary[summary["mean_conf"] <= threshold]

        if dry_run:
            already = set()
        else:
            existing = (
                supabase.table("detections").select("species_scientific_name")
                .eq("site", site).eq("recording_date", date_iso).execute()
            )
            already = {row["species_scientific_name"] for row in existing.data}

        for _, srow in reviewable.iterrows():
            if time.monotonic() >= deadline or state["cards"] >= max_cards:
                day["status"] = "PARTIAL"
                day["note"] = ("stopped mid-day; re-run resumes here (carded species "
                               "are skipped)")
                reason = ("time budget" if time.monotonic() >= deadline
                          else f"card cap {max_cards}")
                state["resume"] = f"Resume: {site} / {date_name} (partial -- re-run this day)"
                state["stop_reason"] = f"{reason} reached mid-day"
                write_ledger(state)
                return state

            species_sci = srow["Scientific name"]
            species_common = srow["Common name"]
            if species_sci in already:
                day["skipped"] += 1
                continue

            # pick a representative call, preferring one with a full padding
            # window inside its own minute-file so before/during/after are intact
            hits = pooled[pooled["Scientific name"] == species_sci].copy()
            hits["dur"] = hits["source_recording"].map(durations).fillna(0.0)
            padded = hits[(hits["Start (s)"] >= CLIP_PADDING_S)
                          & (hits["End (s)"] + CLIP_PADDING_S <= hits["dur"])]
            pick = (padded if not padded.empty else hits).sample(1).iloc[0]
            src_name = pick["source_recording"]
            start_s, end_s = float(pick["Start (s)"]), float(pick["End (s)"])

            with sf.SoundFile(str(work_dir / src_name)) as f:
                emit_detection(
                    f, f.samplerate,
                    recording_id=Path(src_name).stem,
                    species_scientific=species_sci,
                    species_common=species_common,
                    mean_confidence=float(srow["mean_conf"]),
                    capture_count=int(srow["count"]),
                    start_s=start_s, end_s=end_s,
                    site=site, recording_date=date_iso, source_recording=src_name,
                    r2=r2, bucket=bucket, public_url_base=public_url_base,
                    supabase=supabase, dry_run=dry_run,
                )
            day["species"].append(species_common)
            state["cards"] += 1
            print(f"  carded {species_common} ({species_sci}) "
                  f"@ {start_s:.0f}-{end_s:.0f}s in {src_name}")
            write_ledger(state)

        if truncated and time.monotonic() >= deadline:
            state["resume"] = f"Resume: {site} / {date_name} (partial -- re-run this day)"
            state["stop_reason"] = f"{minutes}-min time budget reached (partial day)"
            write_ledger(state)
            break
        write_ledger(state)
    else:
        state["resume"] = f"All dates for {site} processed."
        state["stop_reason"] = "reached end of site"
        write_ledger(state)

    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", required=True, help="e.g. 'Site 4'")
    parser.add_argument("--minutes", type=float, default=20.0,
                        help="Wall-clock budget before stopping at a clean boundary")
    parser.add_argument("--confidence-threshold", type=float, default=0.7,
                        help="Card species at/below this pooled mean confidence")
    parser.add_argument("--start-date", default=None,
                        help="Resume from this YYYYMMDD date folder onward")
    parser.add_argument("--max-cards", type=int, default=300,
                        help="Safety cap on new cards this run (bounds R2 growth)")
    parser.add_argument("--max-files-per-day", type=int, default=None,
                        help="Cap minute-files staged per day (subsample a day; default all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run BirdNET + pick detections but skip R2/Supabase writes")
    args = parser.parse_args()

    state = process_batch(args.site, args.minutes, args.confidence_threshold,
                          args.start_date, args.max_cards,
                          args.max_files_per_day, args.dry_run)
    print(f"\nDone. {state['cards']} cards this run. {state['stop_reason']}")
    print(f"Ledger: {LEDGER}")


if __name__ == "__main__":
    main()
