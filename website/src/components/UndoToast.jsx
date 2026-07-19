import './UndoToast.css'

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="toast-icon">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

// Bottom-center confirmation for a verdict. While it's up the reviewer can undo
// the last Yes/No; after ~5s it commits and fades. role="status" so a screen
// reader hears "Marked correct" without us touching focus.
function UndoToast({ verdict, undone, onUndo }) {
  const label = undone
    ? 'Change undone'
    : verdict === 'yes'
      ? 'Marked correct'
      : 'Marked incorrect'

  return (
    <div className="undo-toast" role="status">
      <CheckIcon />
      <span className="toast-label">{label}</span>
      {!undone && (
        <button type="button" className="toast-undo" onClick={onUndo}>
          Undo
        </button>
      )}
    </div>
  )
}

export default UndoToast
