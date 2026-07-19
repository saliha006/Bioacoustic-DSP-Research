import { useState } from 'react'
import './ReviewedPanel.css'

// A collapsible list of everything the reviewer has judged, so they can revisit
// a call and flip its verdict after the undo window has passed.
function ReviewedPanel({ items, onChangeVerdict }) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <section className="reviewed-panel">
      <button
        type="button"
        className="reviewed-toggle"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Detections reviewed ({items.length})
        <span className="reviewed-chevron" data-open={open} aria-hidden="true" />
      </button>

      {open && (
        <ul className="reviewed-list">
          {items.map(({ detection, verdict }) => (
            <li key={detection.id} className="reviewed-row">
              <div className="reviewed-info">
                <span className="reviewed-name">{detection.speciesCommonName}</span>
                <span className="reviewed-sci">{detection.speciesScientificName}</span>
              </div>
              <div className="reviewed-actions">
                <button
                  type="button"
                  className={`review-btn yes${verdict === 'yes' ? ' active' : ''}`}
                  aria-pressed={verdict === 'yes'}
                  onClick={() => onChangeVerdict(detection.id, 'yes')}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`review-btn no${verdict === 'no' ? ' active' : ''}`}
                  aria-pressed={verdict === 'no'}
                  onClick={() => onChangeVerdict(detection.id, 'no')}
                >
                  No
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ReviewedPanel
