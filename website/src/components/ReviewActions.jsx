// The Yes/No verdict block, shared by the card and its expanded modal so a
// reviewer can judge from either view without the two drifting apart. `verdict`
// is null while a detection is unreviewed, and the chosen answer once it isn't.
function ReviewActions({ verdict, submitting, onPick }) {
  const isReviewed = verdict != null
  return (
    <div className="review">
      <p className="review-status">Is this identification correct?</p>
      <div className="review-actions">
        <button
          type="button"
          className={`review-btn yes${verdict === 'yes' ? ' active' : ''}`}
          aria-pressed={isReviewed ? verdict === 'yes' : undefined}
          disabled={submitting}
          onClick={() => onPick('yes')}
        >
          Yes
        </button>
        <button
          type="button"
          className={`review-btn no${verdict === 'no' ? ' active' : ''}`}
          aria-pressed={isReviewed ? verdict === 'no' : undefined}
          disabled={submitting}
          onClick={() => onPick('no')}
        >
          No
        </button>
      </div>
    </div>
  )
}

export default ReviewActions
