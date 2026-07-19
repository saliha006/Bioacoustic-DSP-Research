import { useEffect, useMemo, useState } from 'react'
import DetectionCard from './components/DetectionCard'
import DetectionCardSkeleton from './components/DetectionCardSkeleton'
import Login from './components/Login'
import { supabase } from './lib/supabaseClient'
import './App.css'

function mapDetection(row) {
  return {
    id: row.id,
    speciesCommonName: row.species_common_name,
    speciesScientificName: row.species_scientific_name,
    meanConfidence: row.mean_confidence,
    captureCount: row.capture_count,
    clipDurationS: row.clip_duration_s,
    beforeClipUrl: row.before_clip_url,
    duringClipUrl: row.during_clip_url,
    afterClipUrl: row.after_clip_url,
    spectrogramUrl: row.spectrogram_url,
    beforeSpectrogramUrl: row.before_spectrogram_url,
    duringSpectrogramUrl: row.spectrogram_url,
    afterSpectrogramUrl: row.after_spectrogram_url,
    reviewStatus: row.review_status,
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [detections, setDetections] = useState([])
  const [reviewedIds, setReviewedIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    // Ordered oldest-first so newly added detections always land at the bottom
    // of the queue; the reviewer's own past verdicts filter this down to what's
    // still outstanding for them.
    Promise.all([
      supabase.from('detections').select('*').order('created_at', { ascending: true }),
      supabase.from('reviews').select('detection_id').eq('reviewer_id', session.user.id),
    ]).then(([detectionsRes, reviewsRes]) => {
      const err = detectionsRes.error || reviewsRes.error
      if (err) {
        setError(err.message)
      } else {
        setDetections(detectionsRes.data.map(mapDetection))
        setReviewedIds(new Set(reviewsRes.data.map((r) => r.detection_id)))
      }
      setLoading(false)
    })
  }, [session])

  const queue = useMemo(
    () => detections.filter((d) => !reviewedIds.has(d.id)),
    [detections, reviewedIds],
  )

  const stats = useMemo(() => {
    const species = new Set(detections.map((d) => d.speciesScientificName))
    return {
      detections: detections.length,
      species: species.size,
      pending: queue.length,
    }
  }, [detections, queue])

  async function handleReview(detectionId, verdict) {
    // Optimistically drop it from the queue, then persist.
    setReviewedIds((prev) => new Set(prev).add(detectionId))
    const { error: saveError } = await supabase.from('reviews').upsert(
      { detection_id: detectionId, reviewer_id: session.user.id, verdict },
      { onConflict: 'detection_id,reviewer_id' },
    )
    if (saveError) {
      setReviewedIds((prev) => {
        const next = new Set(prev)
        next.delete(detectionId)
        return next
      })
      setError(saveError.message)
    }
  }

  if (!authReady) return null
  if (!session) return <Login />

  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-account">
          <span>{session.user.email}</span>
          <button type="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
        <h1>Bird Detection Review</h1>
        <p className="dateline">Tyne Derwent Way · AudioMoth acoustic survey, Gateshead</p>
        <p className="lede">
          Expert verification of BirdNET detections. Hear each call in the seconds
          before, during, and after it was flagged, read the spectrogram, and
          confirm whether the species is right.
        </p>
        {!loading && !error && (
          <dl className="masthead-meta">
            <div>
              <dt>Detections</dt>
              <dd>{stats.detections}</dd>
            </div>
            <div>
              <dt>Species</dt>
              <dd>{stats.species}</dd>
            </div>
            <div>
              <dt>Awaiting your review</dt>
              <dd>{stats.pending}</dd>
            </div>
          </dl>
        )}
      </header>

      {error && <p className="app-error">Failed to load detections: {error}</p>}

      {loading && (
        <div className="detection-gallery" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <DetectionCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !error && queue.length > 0 && (
        <div className="detection-gallery">
          {queue.map((detection, i) => (
            <DetectionCard
              key={detection.id}
              detection={detection}
              onReview={handleReview}
              index={i}
            />
          ))}
        </div>
      )}

      {!loading && !error && queue.length === 0 && (
        <p className="app-done">
          All caught up — you&rsquo;ve reviewed every detection. New ones will
          appear here as they&rsquo;re added.
        </p>
      )}
    </div>
  )
}

export default App
