import { useEffect, useMemo, useState } from 'react'
import DetectionCard from './components/DetectionCard'
import DetectionCardSkeleton from './components/DetectionCardSkeleton'
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
    reviewStatus: row.review_status,
  }
}

function App() {
  const [detections, setDetections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('detections')
      .select('*')
      .order('species_common_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
        } else {
          setDetections(data.map(mapDetection))
        }
        setLoading(false)
      })
  }, [])

  const stats = useMemo(() => {
    const species = new Set(detections.map((d) => d.speciesScientificName))
    const pending = detections.filter((d) => d.reviewStatus === 'pending').length
    return {
      detections: detections.length,
      species: species.size,
      pending,
    }
  }, [detections])

  return (
    <div className="page">
      <header className="masthead">
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
              <dt>Awaiting review</dt>
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

      {!loading && !error && (
        <div className="detection-gallery">
          {detections.map((detection) => (
            <DetectionCard key={detection.id} detection={detection} />
          ))}
        </div>
      )}
    </div>
  )
}

export default App
