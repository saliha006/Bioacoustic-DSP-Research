import DetectionCard from './components/DetectionCard'
import './App.css'

// Hardcoded for now — real data wiring comes once the pipeline (Session 2)
// has populated Supabase. Values below are real, from
// findings/243B1F02648873F9_20260412_031500-findings/*.summary_by_species.csv
const hardcodedDetection = {
  speciesCommonName: 'Eurasian Wren',
  speciesScientificName: 'Troglodytes troglodytes',
  meanConfidence: 0.6636,
  captureCount: 743,
  clipDurationS: 2,
  beforeClipUrl: '/sample/before.wav',
  duringClipUrl: '/sample/during.wav',
  afterClipUrl: '/sample/after.wav',
  spectrogramUrl: '/sample/spectrogram.png',
  reviewStatus: 'pending',
}

function App() {
  return (
    <main className="app">
      <h1>Bird Detection Review</h1>
      <DetectionCard detection={hardcodedDetection} />
    </main>
  )
}

export default App
