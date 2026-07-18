import { useEffect, useRef, useState } from 'react'
import './DetectionCard.css'

const SEGMENTS = [
  { key: 'before', label: 'Before' },
  { key: 'during', label: 'During' },
  { key: 'after', label: 'After' },
]

// Frequency axis is linear Hz up to sr/2. Current data is 48 kHz audio, so the
// spectrogram spans 0-24 kHz. Store per-clip sample rate before processing other
// sample rates (see data-run task) to keep these labels exact.
const FREQ_MAX_KHZ = 24
const FREQ_TICKS = [24, 18, 12, 6, 0]

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.52.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

function DetectionCard({ detection, onReview }) {
  const [segment, setSegment] = useState('during')
  const [submitting, setSubmitting] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const audioRef = useRef(null)
  const stageRef = useRef(null)
  const pendingSeekRef = useRef(null)

  const currentUrl = detection[`${segment}ClipUrl`]
  const activeSegmentLabel = SEGMENTS.find((s) => s.key === segment)?.label
  const durationS = Math.max(1, Math.round(detection.clipDurationS || 3))
  const timeTicks = Array.from({ length: durationS + 1 }, (_, i) => i)

  function selectSegment(key) {
    if (key === segment) return
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    pendingSeekRef.current = null
    setIsPlaying(false)
    setProgress(0)
    setSegment(key)
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      // Only one clip plays at a time across the whole gallery.
      document.querySelectorAll('audio').forEach((el) => {
        if (el !== audio) el.pause()
      })
      audio.play()
    } else {
      audio.pause()
    }
  }

  // playhead runs off requestAnimationFrame while playing — the timeupdate
  // event only fires ~4x/sec, which looked choppy
  useEffect(() => {
    if (!isPlaying) return
    let frame
    const tick = () => {
      const audio = audioRef.current
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        setProgress(audio.currentTime / audio.duration)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying])

  function seekToClientX(clientX) {
    const stage = stageRef.current
    const audio = audioRef.current
    if (!stage || !audio) return
    const rect = stage.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    setProgress(ratio)
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      // stop a hair short of the end so scrubbing to the far edge doesn't
      // trip 'ended' and bounce back to the start
      audio.currentTime = Math.min(ratio * audio.duration, audio.duration - 0.05)
      pendingSeekRef.current = null
    } else {
      // duration isn't known until the clip loads — apply the seek then
      pendingSeekRef.current = ratio
    }
  }

  function startScrub(event) {
    setIsScrubbing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    seekToClientX(event.clientX)
  }

  function moveScrub(event) {
    if (isScrubbing) seekToClientX(event.clientX)
  }

  function endScrub() {
    setIsScrubbing(false)
  }

  function applyPendingSeek() {
    const audio = audioRef.current
    if (audio && pendingSeekRef.current != null && Number.isFinite(audio.duration)) {
      audio.currentTime = pendingSeekRef.current * audio.duration
      pendingSeekRef.current = null
    }
  }

  return (
    <article className="detection-card">
      <div className="card-heading">
        <h2>{detection.speciesCommonName}</h2>
        <p className="scientific-name">{detection.speciesScientificName}</p>
      </div>

      <dl className="stats">
        <div>
          <dt>Mean confidence</dt>
          <dd>{(detection.meanConfidence * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Captures</dt>
          <dd>{detection.captureCount}</dd>
        </div>
        <div>
          <dt>Clip length</dt>
          <dd>{detection.clipDurationS}s</dd>
        </div>
      </dl>

      <figure className="spectrogram-figure">
      <div className="freq-axis" aria-hidden="true">
        {FREQ_TICKS.map((k, i) => (
          <span key={k} style={{ top: `${(1 - k / FREQ_MAX_KHZ) * 100}%` }}>
            {i === 0 ? `${k} kHz` : k}
          </span>
        ))}
      </div>

      <div
        ref={stageRef}
        className={`stage${isPlaying ? ' is-playing' : ''}`}
        onPointerDown={startScrub}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        <img
          className="spectrogram"
          src={detection.spectrogramUrl}
          alt={`Spectrogram of the ${detection.speciesCommonName} detection`}
          draggable={false}
        />
        <div className="stage-scrim" aria-hidden="true" />

        <div
          className={`playhead${isPlaying || progress > 0 || isScrubbing ? ' is-active' : ''}`}
          style={{ left: `${progress * 100}%` }}
          aria-hidden="true"
        />

        <button
          type="button"
          className="play-button"
          onClick={togglePlay}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`${isPlaying ? 'Pause' : 'Play'} the ${activeSegmentLabel.toLowerCase()} clip for ${detection.speciesCommonName}`}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <audio
          ref={audioRef}
          src={currentUrl}
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false)
            setProgress(0)
          }}
          onLoadedMetadata={applyPendingSeek}
        />
      </div>

      <div className="time-axis" aria-hidden="true">
        {timeTicks.map((t, i) => (
          <span key={t} style={{ left: `${(t / durationS) * 100}%` }}>
            <b>{i === timeTicks.length - 1 ? `${t}s` : t}</b>
          </span>
        ))}
      </div>
      </figure>

      <div className="segments" role="group" aria-label="Clip segment">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={segment === s.key ? 'active' : ''}
            aria-pressed={segment === s.key}
            onClick={() => selectSegment(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="review">
        <div className="review-actions">
          <button
            type="button"
            className="review-btn yes"
            disabled={submitting}
            onClick={() => {
              setSubmitting(true)
              onReview(detection.id, 'yes')
            }}
          >
            Yes
          </button>
          <button
            type="button"
            className="review-btn no"
            disabled={submitting}
            onClick={() => {
              setSubmitting(true)
              onReview(detection.id, 'no')
            }}
          >
            No
          </button>
        </div>
        <p className="review-status">Is this identification correct?</p>
      </div>
    </article>
  )
}

export default DetectionCard
