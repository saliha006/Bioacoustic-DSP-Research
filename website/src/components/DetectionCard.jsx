import { useRef, useState } from 'react'
import SpectrogramStage from './SpectrogramStage'
import DetectionModal from './DetectionModal'
import { useClipPlayer } from './useClipPlayer'
import './DetectionCard.css'

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M15 20h4a1 1 0 0 0 1-1v-4M9 20H5a1 1 0 0 1-1-1v-4" />
    </svg>
  )
}

function DetectionCard({ detection, verdict = null, onVerdict, index = 0 }) {
  // In the queue there's no verdict yet; in the reviewed view the card carries
  // the reviewer's existing Yes/No so the chosen button reads as selected.
  const isReviewed = verdict != null
  const [submitting, setSubmitting] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const player = useClipPlayer(detection)
  const expandButtonRef = useRef(null)

  function pick(choice) {
    // Only the queue removes the card on click, so guard against a double-fire
    // there; in the reviewed view the buttons stay live for re-judging.
    if (!isReviewed) setSubmitting(true)
    onVerdict(detection.id, choice)
  }

  function openExpanded() {
    // Silence the card's own clip so nothing keeps playing behind the modal.
    document.querySelectorAll('audio').forEach((el) => el.pause())
    setIsExpanded(true)
  }

  function closeExpanded() {
    setIsExpanded(false)
    expandButtonRef.current?.focus()
  }

  const expandButton = (
    <button
      ref={expandButtonRef}
      type="button"
      className="stage-expand"
      onClick={openExpanded}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={`Expand the ${detection.speciesCommonName} spectrogram`}
    >
      <ExpandIcon />
    </button>
  )

  return (
    <article className="detection-card" style={{ '--i': index }}>
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

      <SpectrogramStage
        detection={detection}
        player={player}
        stageControl={expandButton}
      />

      <div className="review">
        <p className="review-status">Is this identification correct?</p>
        <div className="review-actions">
          <button
            type="button"
            className={`review-btn yes${verdict === 'yes' ? ' active' : ''}`}
            aria-pressed={isReviewed ? verdict === 'yes' : undefined}
            disabled={submitting}
            onClick={() => pick('yes')}
          >
            Yes
          </button>
          <button
            type="button"
            className={`review-btn no${verdict === 'no' ? ' active' : ''}`}
            aria-pressed={isReviewed ? verdict === 'no' : undefined}
            disabled={submitting}
            onClick={() => pick('no')}
          >
            No
          </button>
        </div>
      </div>

      {isExpanded && <DetectionModal detection={detection} onClose={closeExpanded} />}
    </article>
  )
}

export default DetectionCard
