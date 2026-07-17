import { useRef, useState } from 'react'
import './DetectionCard.css'

const SEGMENTS = [
  { key: 'before', label: 'Before' },
  { key: 'during', label: 'During' },
  { key: 'after', label: 'After' },
]

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
  const audioRef = useRef(null)

  const currentUrl = detection[`${segment}ClipUrl`]
  const activeSegmentLabel = SEGMENTS.find((s) => s.key === segment)?.label

  function selectSegment(key) {
    if (key === segment) return
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
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

  function handleTimeUpdate() {
    const audio = audioRef.current
    if (audio && audio.duration) {
      setProgress(audio.currentTime / audio.duration)
    }
  }

  function seek(event) {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const ratio = Number(event.target.value)
    audio.currentTime = ratio * audio.duration
    setProgress(ratio)
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

      <div className={`stage${isPlaying ? ' is-playing' : ''}`}>
        <img
          className="spectrogram"
          src={detection.spectrogramUrl}
          alt={`Spectrogram of the ${detection.speciesCommonName} detection`}
        />
        <div className="stage-scrim" aria-hidden="true" />

        <button
          type="button"
          className="play-button"
          onClick={togglePlay}
          aria-label={`${isPlaying ? 'Pause' : 'Play'} the ${activeSegmentLabel.toLowerCase()} clip for ${detection.speciesCommonName}`}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <input
          type="range"
          className="scrubber"
          min="0"
          max="1"
          step="0.001"
          value={progress}
          onChange={seek}
          style={{ '--fill': `${progress * 100}%` }}
          aria-label={`Seek within the ${activeSegmentLabel.toLowerCase()} clip`}
        />

        <audio
          ref={audioRef}
          src={currentUrl}
          preload="none"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false)
            setProgress(0)
          }}
          onTimeUpdate={handleTimeUpdate}
        />
      </div>

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
