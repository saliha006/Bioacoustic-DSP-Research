import { SEGMENTS } from './useClipPlayer'
import './SpectrogramStage.css'

// Frequency axis is linear Hz up to sr/2. Current data is 48 kHz audio, so the
// spectrogram spans 0-24 kHz. Store per-clip sample rate before processing other
// sample rates (see data-run task) to keep these labels exact.
const FREQ_MAX_KHZ = 24
const FREQ_TICKS = [24, 18, 12, 6, 0]

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.52.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

// The spectrogram image with its external kHz/seconds axes, the drag-to-seek
// stage, the playhead and the segment tabs. Shared by the card and its expanded
// modal so both behave identically; `player` is a useClipPlayer instance and
// `stageControl` is an optional overlay (the card passes its expand button).
function SpectrogramStage({ detection, player, stageControl }) {
  const {
    segment,
    selectSegment,
    isPlaying,
    progress,
    isScrubbing,
    audioRef,
    stageRef,
    currentUrl,
    activeSegmentLabel,
    togglePlay,
    startScrub,
    moveScrub,
    endScrub,
    applyPendingSeek,
    onPlay,
    onPause,
    onEnded,
  } = player

  const durationS = Math.max(1, Math.round(detection.clipDurationS || 3))
  const timeTicks = Array.from({ length: durationS + 1 }, (_, i) => i)
  // rows regenerated with per-segment spectrograms swap the image with the tab;
  // older rows only have the during image, so fall back to that
  const spectrogramUrl = detection[`${segment}SpectrogramUrl`] || detection.spectrogramUrl

  return (
    <>
      <figure className="spectrogram-figure">
        <div className="freq-axis" aria-hidden="true">
          {FREQ_TICKS.map((k, i) => (
            <span key={k} style={{ top: `${(1 - k / FREQ_MAX_KHZ) * 100}%` }}>
              {i === 0 ? `${k} kHz` : k}
            </span>
          ))}
        </div>

        <div
          ref={stageRef}
          className={`stage${isPlaying ? ' is-playing' : ''}`}
          onPointerDown={startScrub}
          onPointerMove={moveScrub}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
        >
          <img
            className="spectrogram"
            src={spectrogramUrl}
            alt={`Spectrogram of the ${detection.speciesCommonName} detection`}
            draggable={false}
          />
          <div className="stage-scrim" aria-hidden="true" />

          <div
            className={`playhead${isPlaying || progress > 0 || isScrubbing ? ' is-active' : ''}`}
            style={{ left: `${progress * 100}%` }}
            aria-hidden="true"
          />

          <button
            type="button"
            className="play-button"
            onClick={togglePlay}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`${isPlaying ? 'Pause' : 'Play'} the ${activeSegmentLabel.toLowerCase()} clip for ${detection.speciesCommonName}`}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {stageControl}

          <audio
            ref={audioRef}
            src={currentUrl}
            preload="auto"
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onEnded}
            onLoadedMetadata={applyPendingSeek}
          />
        </div>

        <div className="time-axis" aria-hidden="true">
          {timeTicks.map((t, i) => (
            <span key={t} style={{ left: `${(t / durationS) * 100}%` }}>
              <b>{i === timeTicks.length - 1 ? `${t}s` : t}</b>
            </span>
          ))}
        </div>
      </figure>

      <div className="segments" role="group" aria-label="Clip segment">
        {SEGMENTS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={segment === s.key ? 'active' : ''}
            aria-pressed={segment === s.key}
            onClick={() => selectSegment(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </>
  )
}

export default SpectrogramStage
