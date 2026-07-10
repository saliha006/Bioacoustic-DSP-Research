# Bioacoustic DSP Research — Bird Monitoring Internship

Research internship project (Northumbria University, AHRC-funded — *Kittiwakes and Urban Environments*) applying bioacoustic signal processing and machine learning to identify bird species from continuous field audio.

## Overview

Ten [AudioMoth](https://www.openacousticdevices.info/audiomoth) recorders were deployed along the Tyne Derwent Way (Swalwell / Gateshead, NE England), continuously capturing ambient audio across woodland, wetland, and residential sites. Recordings are processed through [BirdNET](https://birdnet.cornell.edu/), Cornell Lab's deep-learning bird-species classifier, producing per-recording species detections with confidence scores.

Since automated detections need expert confirmation before they count as verified data, the project also includes a review app: a tool where an ornithology expert listens to and inspects each detection — spectrogram, segmented audio, species and confidence — and confirms or rejects it. Confirmed detections are persisted as verified research data.

## Repository structure

```
findings/          BirdNET detection output — species, confidence, detection counts, per recording
pipeline/           Batch script: cuts clips + spectrograms, uploads to R2, inserts Supabase rows
presentation/       Project presentation
website/            Review app (Vite + React + Supabase)
```

## Tech stack

- **Audio processing:** Python, BirdNET, librosa
- **Review app:** Vite, React, Supabase (Postgres), Cloudflare R2 (clip/spectrogram storage)
