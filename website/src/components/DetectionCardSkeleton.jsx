import './DetectionCard.css'

function DetectionCardSkeleton() {
  return (
    <article className="detection-card is-skeleton">
      <div className="sk sk-title" />
      <div className="sk sk-sci" />
      <div className="sk sk-stats" />
      <div className="sk sk-stage" />
      <div className="sk sk-tabs" />
      <div className="sk sk-actions" />
    </article>
  )
}

export default DetectionCardSkeleton
