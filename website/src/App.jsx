import { useEffect, useState } from 'react'
import DetectionCard from './components/DetectionCard'
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

  return (
    <main className="app">
      <h1>Bird Detection Review</h1>
      {loading && <p className="app-status">Loading detections…</p>}
      {error && <p className="app-status app-error">Failed to load detections: {error}</p>}
      {!loading && !error && (
        <div className="detection-gallery">
          {detections.map((detection) => (
            <DetectionCard key={detection.id} detection={detection} />
          ))}
        </div>
      )}
    </main>
  )
}

export default App
