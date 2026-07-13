import { useState } from 'react'
import './DetectionCard.css'

const SEGMENTS = [
  { key: 'before', label: 'Before' },
  { key: 'during', label: 'During' },
  { key: 'after', label: 'After' },
]

function DetectionCard({ detection }) {
  const [segment, setSegment] = useState('during')
  const [reviewStatus, setReviewStatus] = useState(detection.reviewStatus)

  return (
    <div className="detection-card">
      <div className="detection-info">
        <h2>{detection.speciesCommonName}</h2>
        <p className="scientific-name">{detection.speciesScientificName}</p>

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
            <dt>Clip duration</dt>
            <dd>{detection.clipDurationS}s</dd>
          </div>
        </dl>
      </div>

      <img
        className="spectrogram"
        src={detection.spectrogramUrl}
        alt={`Spectrogram for ${detection.speciesCommonName} detection`}
      />

      <div className="segment-player">
        <div className="segment-tabs">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={segment === s.key ? 'active' : ''}
              onClick={() => setSegment(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <audio key={segment} controls src={detection[`${segment}ClipUrl`]} />
      </div>

      <div className="review-actions">
        <button
          type="button"
          className={reviewStatus === 'yes' ? 'review-btn yes active' : 'review-btn yes'}
          onClick={() => setReviewStatus('yes')}
        >
          Yes
        </button>
        <button
          type="button"
          className={reviewStatus === 'no' ? 'review-btn no active' : 'review-btn no'}
          onClick={() => setReviewStatus('no')}
        >
          No
        </button>
      </div>
      <p className="review-status">Status: {reviewStatus}</p>
    </div>
  )
}

export default DetectionCard
