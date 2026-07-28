import { useEffect, useRef } from 'react'
import { SEGMENTS, getVolume, setVolume, subscribeVolume } from './useClipPlayer'
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

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      <path d="M16 9a4.5 4.5 0 0 1 0 6" />
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
  const activeIndex = SEGMENTS.findIndex((s) => s.key === segment)

  // The slider is uncontrolled: the shared level is written onto the input so a
  // drag on one card moves every other card's slider without a React render.
  // Skip the input being dragged - it already shows the right value.
  const volumeInputRef = useRef(null)
  useEffect(
    () =>
      subscribeVolume((level) => {
        const input = volumeInputRef.current
        if (input && document.activeElement !== input) input.value = String(level)
      }),
    [],
  )

  // Glass hover pill that trails the cursor across the three tabs. A self-driven
  // rAF loop writes the pill's transform straight onto the element while the
  // mouse is over the group — no React state, so nothing re-renders per frame
  // (that per-pointermove setState was what made it stutter on the hosted build).
  // The pill eases toward the cursor and leans on both axes, like weight shifting
  // inside a bubble, and hides over the active tab. Mouse only — touch has no
  // hover to track.
  const segmentsRef = useRef(null)
  const hoverElRef = useRef(null)
  const rectRef = useRef(null)
  const rafRef = useRef(0)
  const pointerRef = useRef({ x: 0, y: 0 })
  const hoverIndexRef = useRef(-1)
  const motionRef = useRef({ tx: 0, dy: 0, sx: 1 }) // current on-screen values, lerped toward the target
  const reduceRef = useRef(false)
  // Keep the active index reachable from the rAF loop without re-binding it.
  const activeIndexRef = useRef(activeIndex)
  activeIndexRef.current = activeIndex

  useEffect(() => {
    reduceRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  function columnWidth(rect) {
    return (rect.width - 8) / SEGMENTS.length
  }

  function runHover() {
    const el = hoverElRef.current
    const rect = rectRef.current
    if (!el || !rect) {
      rafRef.current = 0
      return
    }
    const colW = columnWidth(rect)
    const x = pointerRef.current.x - rect.left - 4
    const index = Math.max(0, Math.min(SEGMENTS.length - 1, Math.floor(x / colW)))
    if (index !== hoverIndexRef.current) {
      // a little squish when the pill crosses into a new tab, then it settles
      if (hoverIndexRef.current !== -1 && !reduceRef.current) motionRef.current.sx = 1.15
      hoverIndexRef.current = index
    }
    // target = the column, plus a magnetic lean toward the cursor on both axes;
    // centred on a tab the lean is ~0, so the pill keeps its resting shape there
    const leanX = reduceRef.current ? 0 : Math.max(-7, Math.min(7, (x - (index * colW + colW / 2)) * 0.24))
    const leanY = reduceRef.current ? 0 : Math.max(-4, Math.min(4, (pointerRef.current.y - rect.top - rect.height / 2) * 0.24))
    const targetTx = index * colW + leanX
    const ease = reduceRef.current ? 1 : 0.25
    const m = motionRef.current
    m.tx += (targetTx - m.tx) * ease
    m.dy += (leanY - m.dy) * ease
    m.sx += (1 - m.sx) * 0.18
    el.style.transform = `translate(${m.tx.toFixed(2)}px, ${m.dy.toFixed(2)}px) scaleX(${m.sx.toFixed(3)})`
    el.style.opacity = index === activeIndexRef.current ? '0' : '1'
    rafRef.current = requestAnimationFrame(runHover)
  }

  function enterSegments(event) {
    if (event.pointerType !== 'mouse') return
    const rect = segmentsRef.current?.getBoundingClientRect()
    if (!rect) return
    rectRef.current = rect
    pointerRef.current = { x: event.clientX, y: event.clientY }
    // seed the pill at the cursor's column so it appears in place instead of
    // sliding in from the first tab
    if (hoverIndexRef.current === -1) {
      const colW = columnWidth(rect)
      const start = Math.max(0, Math.min(SEGMENTS.length - 1, Math.floor((event.clientX - rect.left - 4) / colW)))
      motionRef.current = { tx: start * colW, dy: 0, sx: 1 }
      hoverIndexRef.current = start
    }
    if (!rafRef.current) rafRef.current = requestAnimationFrame(runHover)
  }

  function trackSegments(event) {
    if (event.pointerType !== 'mouse') return
    pointerRef.current = { x: event.clientX, y: event.clientY }
  }

  function endSegments() {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    hoverIndexRef.current = -1
    rectRef.current = null
    if (hoverElRef.current) hoverElRef.current.style.opacity = '0'
  }
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

          {/* Full-width track shifted by transform so the playhead rides the
              GPU — animating `left` per frame would relayout every card. */}
          <div
            className="playhead-track"
            style={{ transform: `translateX(${progress * 100}%)` }}
            aria-hidden="true"
          >
            <div
              className={`playhead${isPlaying || progress > 0 || isScrubbing ? ' is-active' : ''}`}
            />
          </div>

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

        {/* Drag up/down to set playback level. Sits in its own gutter beside the
            spectrogram rather than over the trace. */}
        <div className="volume">
          <SpeakerIcon />
          <input
            ref={volumeInputRef}
            type="range"
            min="0"
            max="1"
            step="0.01"
            defaultValue={getVolume()}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label={`Volume for the ${detection.speciesCommonName} clip`}
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

      <div
        className="segments"
        role="group"
        aria-label="Clip segment"
        ref={segmentsRef}
        onPointerEnter={enterSegments}
        onPointerMove={trackSegments}
        onPointerLeave={endSegments}
      >
        {/* White pill that slides under the active label; the orange underline it
            carries is the one resting-state accent on the page. */}
        <span
          className="segment-thumb"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
          aria-hidden="true"
        />
        {/* Glass pill that trails the cursor across the tabs — positioned by the
            rAF loop above, straight onto this node. */}
        <span className="segment-hover" aria-hidden="true" ref={hoverElRef} />
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
