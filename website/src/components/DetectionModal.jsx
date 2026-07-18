import { useEffect, useRef } from 'react'
import SpectrogramStage from './SpectrogramStage'
import { useClipPlayer } from './useClipPlayer'
import './DetectionModal.css'

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  )
}

// Enlarged view of a single detection's spectrogram. Runs its own clip player
// (separate <audio> from the card behind it); opening the modal pauses the card,
// and only one clip ever plays at a time, so the two never overlap.
function DetectionModal({ detection, onClose }) {
  const player = useClipPlayer(detection)
  const panelRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    const restoreOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    return () => {
      document.body.style.overflow = restoreOverflow
    }
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    // Trap Tab within the dialog so focus can't wander back to the page behind.
    const focusable = panelRef.current.querySelectorAll(
      'button, [href], input, [tabindex]:not([tabindex="-1"])',
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${detection.speciesCommonName} spectrogram, expanded`}
        onKeyDown={handleKeyDown}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close the expanded spectrogram"
        >
          <CloseIcon />
        </button>

        <div className="modal-heading">
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

        <SpectrogramStage detection={detection} player={player} />
      </div>
    </div>
  )
}

export default DetectionModal
