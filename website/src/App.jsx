import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DetectionCard from './components/DetectionCard'
import DetectionCardSkeleton from './components/DetectionCardSkeleton'
import Login from './components/Login'
import UndoToast from './components/UndoToast'
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
  const [toast, setToast] = useState(null)
  // The last verdict waits out a short undo window before it's written. Holding
  // the pending write here (instead of firing on click) means Undo just cancels
  // it — nothing to delete server-side.
  const pendingRef = useRef(null)
  const dismissRef = useRef(null)

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

  const restoreToQueue = useCallback((detectionId) => {
    // The queue is derived from the stable oldest-first detections list, so
    // simply un-reviewing an id drops the card back into its original slot.
    setReviewedIds((prev) => {
      const next = new Set(prev)
      next.delete(detectionId)
      return next
    })
  }, [])

  const commitReview = useCallback(
    async (detectionId, verdict) => {
      const { error: saveError } = await supabase.from('reviews').upsert(
        { detection_id: detectionId, reviewer_id: session.user.id, verdict },
        { onConflict: 'detection_id,reviewer_id' },
      )
      if (saveError) {
        // Put the card back where it was and surface the failure rather than
        // silently dropping the verdict.
        restoreToQueue(detectionId)
        setError(`Couldn't save that review: ${saveError.message}`)
      }
    },
    [session, restoreToQueue],
  )

  // Write out whatever's still inside its undo window right now.
  const flushPending = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return
    clearTimeout(pending.commitTimer)
    pendingRef.current = null
    commitReview(pending.detectionId, pending.verdict)
  }, [commitReview])

  function handleReview(detectionId, verdict) {
    // A fresh verdict commits the previous one and takes over the undo window.
    flushPending()
    clearTimeout(dismissRef.current)

    setReviewedIds((prev) => new Set(prev).add(detectionId))
    setToast({ verdict, undone: false })

    const commitTimer = setTimeout(() => {
      if (!pendingRef.current) return
      const { detectionId: id, verdict: v } = pendingRef.current
      pendingRef.current = null
      commitReview(id, v)
      setToast(null)
    }, 5000)
    pendingRef.current = { detectionId, verdict, commitTimer }
  }

  function handleUndo() {
    const pending = pendingRef.current
    if (!pending) return
    clearTimeout(pending.commitTimer)
    pendingRef.current = null
    restoreToQueue(pending.detectionId)
    setToast({ verdict: pending.verdict, undone: true })
    dismissRef.current = setTimeout(() => setToast(null), 2500)
  }

  // Don't lose a verdict that's mid-window when the app unmounts (e.g. sign-out).
  useEffect(() => {
    window.addEventListener('beforeunload', flushPending)
    return () => {
      window.removeEventListener('beforeunload', flushPending)
      flushPending()
    }
  }, [flushPending])

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

      {toast && (
        <UndoToast verdict={toast.verdict} undone={toast.undone} onUndo={handleUndo} />
      )}
    </div>
  )
}

export default App
