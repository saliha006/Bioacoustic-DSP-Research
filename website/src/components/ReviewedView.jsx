import DetectionCard from './DetectionCard'
import './ReviewedView.css'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

// The full-page revisit screen: one detection per row so the reviewer can scroll
// back through everything they've judged and flip a verdict if they got one wrong.
function ReviewedView({ items, onChangeVerdict, onBack }) {
  return (
    <div className="reviewed-view">
      <div className="reviewed-view-head">
        <button type="button" className="back-btn" onClick={onBack}>
          <BackIcon />
          Back to review
        </button>
        <h1>Detections reviewed</h1>
        <p className="dateline">
          {items.length} judged — reopen any call to change your verdict.
        </p>
      </div>

      <div className="reviewed-column">
        {items.map(({ detection, verdict }, i) => (
          <DetectionCard
            key={detection.id}
            detection={detection}
            verdict={verdict}
            onVerdict={onChangeVerdict}
            index={i}
          />
        ))}
      </div>
    </div>
  )
}

export default ReviewedView
