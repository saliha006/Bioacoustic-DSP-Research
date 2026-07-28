"""Populate the example_calls table with reference song/call/warning recordings
from Xeno-canto, so a reviewer can compare a detection against a known example
of that call type.

For every species already in the detections table, this pulls up to two
recordings per category (song / call / alarm-call), preferring high-quality
(Xeno-canto rating A), UK-then-Europe, and naturally short (<= --max-len s)
recordings so the files stay small and local to the survey's dialect. The
original file is stored on R2 unchanged (no transcode) — that keeps us within
every Creative Commons licence including No-Derivatives, and the credit
(recordist + licence + link) is saved alongside for attribution.

Needs pipeline/.env with SUPABASE_URL / SUPABASE_KEY (service_role), the R2_*
keys, and XENO_CANTO_API_KEY (a Xeno-canto v3 key).

Usage:
    python fetch_example_calls.py --dry-run          # show what it would fetch
    python fetch_example_calls.py --limit 3          # only the first 3 species
    python fetch_example_calls.py                    # populate everything missing
    python fetch_example_calls.py --overwrite        # re-fetch even if rows exist
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import PurePosixPath

from dotenv import load_dotenv

XC_API = "https://xeno-canto.org/api/3/recordings"
USER_AGENT = "bioacoustic-dsp-research/1.0 (reference-call fetcher)"

# Our category -> the Xeno-canto recording "type" tag. Xeno-canto has no
# "warning", its equivalent is the alarm call.
CATEGORY_TO_XC_TYPE = {"song": "song", "call": "call", "warning": "alarm call"}

# Quality ratings good enough to use as a reference, best first.
GOOD_QUALITY = ["A", "B"]


def xc_get(query_tags, api_key):
    """One Xeno-canto v3 search. query_tags is the space-separated tag string."""
    params = urllib.parse.urlencode({"query": query_tags, "key": api_key})
    request = urllib.request.Request(f"{XC_API}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    # be polite to the API between calls
    time.sleep(1.0)
    return payload.get("recordings", [])


def licence_label(lic_url):
    """Turn '//creativecommons.org/licenses/by-nc-sa/4.0/' into 'CC BY-NC-SA 4.0'."""
    if not lic_url:
        return None
    parts = [p for p in lic_url.strip("/").split("/") if p]
    try:
        code = parts[parts.index("licenses") + 1]
        version = parts[parts.index("licenses") + 2]
        return f"CC {code.upper()} {version}"
    except (ValueError, IndexError):
        if "publicdomain" in lic_url or "zero" in lic_url:
            return "CC0"
        return None


def length_seconds(length_str):
    """Xeno-canto length comes as 'm:ss' (sometimes 'h:mm:ss')."""
    try:
        bits = [int(b) for b in length_str.split(":")]
    except (ValueError, AttributeError):
        return None
    seconds = 0
    for bit in bits:
        seconds = seconds * 60 + bit
    return seconds


def full_url(maybe_relative):
    if not maybe_relative:
        return None
    if maybe_relative.startswith("//"):
        return "https:" + maybe_relative
    return maybe_relative


def pick_recordings(scientific_name, xc_type, api_key, max_len, want):
    """Search strict-to-loose until we have `want` recordings, best first."""
    genus, _, species = scientific_name.partition(" ")
    base = f'grp:birds gen:{genus} sp:{species} type:"{xc_type}"'
    # Each step relaxes one constraint: quality, then region, then length.
    searches = [
        f'{base} q:A cnt:"United Kingdom" len:0-{max_len}',
        f"{base} q:A area:europe len:0-{max_len}",
        f"{base} q:A len:0-{max_len}",
        f'{base} q:">C" area:europe len:0-{max_len}',
        f'{base} q:">C" cnt:"United Kingdom"',
        f"{base} area:europe",
    ]
    seen_ids = set()
    chosen = []
    for query_tags in searches:
        for rec in xc_get(query_tags, api_key):
            if rec["id"] in seen_ids or not full_url(rec.get("file")):
                continue
            seen_ids.add(rec["id"])
            chosen.append(rec)
            if len(chosen) >= want:
                return chosen
    return chosen


def r2_key_for(scientific_name, category, rank, file_url):
    slug = scientific_name.lower().replace(" ", "-")
    ext = PurePosixPath(urllib.parse.urlparse(file_url).path).suffix.lower() or ".mp3"
    return f"example-calls/{slug}/{category}-{rank}{ext}"


CONTENT_TYPES = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".flac": "audio/flac", ".m4a": "audio/mp4",
}


def download(file_url):
    request = urllib.request.Request(file_url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def build_r2_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def build_supabase_client():
    from supabase import create_client

    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])


def main():
    # Recordist names carry accents and non-Latin characters, and the Windows
    # console is cp1252 by default, so the progress prints would crash on them.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="Search Xeno-canto and print picks, but don't download/upload/insert")
    parser.add_argument("--limit", type=int, default=None,
                        help="Only process the first N species (testing)")
    parser.add_argument("--per-category", type=int, default=2,
                        help="How many recordings to keep per category (default 2)")
    parser.add_argument("--max-len", type=int, default=30,
                        help="Preferred maximum recording length in seconds (default 30)")
    parser.add_argument("--overwrite", action="store_true",
                        help="Re-fetch a species+category even if it already has rows")
    args = parser.parse_args()

    load_dotenv()
    api_key = os.environ["XENO_CANTO_API_KEY"]
    supabase = build_supabase_client()

    species_rows = (
        supabase.table("detections")
        .select("species_scientific_name, species_common_name")
        .execute()
    )
    species = {r["species_scientific_name"]: r["species_common_name"] for r in species_rows.data}
    names = sorted(species)
    if args.limit:
        names = names[: args.limit]
    print(f"{len(names)} species to consider (per-category={args.per_category}, "
          f"max-len={args.max_len}s, {'dry-run' if args.dry_run else 'live'})")

    existing = supabase.table("example_calls").select("species_scientific_name, category").execute()
    have = {(r["species_scientific_name"], r["category"]) for r in existing.data}

    r2 = bucket = public_url_base = None
    if not args.dry_run:
        r2 = build_r2_client()
        bucket = os.environ["R2_BUCKET"]
        public_url_base = os.environ["R2_PUBLIC_URL_BASE"]

    for scientific_name in names:
        common = species[scientific_name]
        for category, xc_type in CATEGORY_TO_XC_TYPE.items():
            if not args.overwrite and (scientific_name, category) in have:
                print(f"  {common} / {category}: already have rows, skipping")
                continue

            recordings = pick_recordings(scientific_name, xc_type, api_key,
                                         args.max_len, args.per_category)
            if not recordings:
                print(f"  {common} / {category}: no Xeno-canto match")
                continue

            for rank, rec in enumerate(recordings, start=1):
                file_url = full_url(rec["file"])
                secs = length_seconds(rec.get("length"))
                credit = f"{rec.get('rec', '?')} · {licence_label(rec.get('lic')) or 'CC'}"
                print(f"  {common} / {category} #{rank}: XC{rec['id']} "
                      f"({rec.get('cnt', '?')}, q{rec.get('q', '?')}, {secs}s) {credit}")
                if args.dry_run:
                    continue

                key = r2_key_for(scientific_name, category, rank, file_url)
                ext = PurePosixPath(key).suffix
                r2.put_object(
                    Bucket=bucket, Key=key, Body=download(file_url),
                    ContentType=CONTENT_TYPES.get(ext, "application/octet-stream"),
                    CacheControl="public, max-age=31536000",
                )
                supabase.table("example_calls").insert({
                    "species_scientific_name": scientific_name,
                    "category": category,
                    "audio_url": f"{public_url_base}/{key}",
                    "recordist": rec.get("rec"),
                    "license": licence_label(rec.get("lic")),
                    "source_url": full_url(rec.get("url")),
                    "rank": rank,
                }).execute()


if __name__ == "__main__":
    main()
