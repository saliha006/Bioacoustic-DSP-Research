import { useEffect, useRef, useState } from 'react'

export const SEGMENTS = [
  { key: 'before', label: 'Before' },
  { key: 'during', label: 'During' },
  { key: 'after', label: 'After' },
]

// One volume for the whole page: set it on any card and it applies to whatever
// you play next, rather than every detection remembering its own level. Held
// outside React and written straight onto the <audio> elements and the slider
// inputs — as a controlled value it would re-render all ~70 gallery cards on
// every drag frame, which is the stutter the hover pill already ran into.
let volumeLevel = 1
const volumeSubscribers = new Set()

export function getVolume() {
  return volumeLevel
}

export function setVolume(level) {
  volumeLevel = level
  document.querySelectorAll('audio').forEach((el) => {
    el.volume = level
  })
  volumeSubscribers.forEach((notify) => notify(level))
}

export function subscribeVolume(notify) {
  volumeSubscribers.add(notify)
  return () => volumeSubscribers.delete(notify)
}

function clampRatio(clientX, rect) {
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
}

// Drives one spectrogram clip: play/pause, drag-to-seek, and the playhead.
// The card and the expanded modal each mount their own instance (own <audio>),
// so togglePlay pauses every other <audio> on the page before starting this one
// — that's what keeps a single clip playing at a time across the whole gallery.
export function useClipPlayer(detection) {
  const [segment, setSegment] = useState('during')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [hasPosition, setHasPosition] = useState(false)
  const audioRef = useRef(null)
  const stageRef = useRef(null)
  const trackRef = useRef(null)
  const pendingSeekRef = useRef(null)

  // The playhead's position is written straight onto the track element instead of
  // going through state. Holding it in state re-rendered the whole card on every
  // frame of a drag, which is what made the line feel like it was lagging behind
  // the cursor. Same reason the segment hover pill runs off refs.
  const scrubRef = useRef({ active: false, rect: null, x: 0, ratio: 0 })

  const currentUrl = detection[`${segment}ClipUrl`]
  const activeSegmentLabel = SEGMENTS.find((s) => s.key === segment)?.label

  function paintPlayhead(ratio) {
    const track = trackRef.current
    if (track) track.style.transform = `translateX(${ratio * 100}%)`
  }

  function selectSegment(key) {
    if (key === segment) return
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    pendingSeekRef.current = null
    setIsPlaying(false)
    setHasPosition(false)
    paintPlayhead(0)
    setSegment(key)
  }

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      // Only one clip plays at a time across the whole gallery.
      document.querySelectorAll('audio').forEach((el) => {
        if (el !== audio) el.pause()
      })
      audio.play()
    } else {
      audio.pause()
    }
  }

  // A card mounted after the level was set (or the modal opening over one) starts
  // at the shared level instead of full blast.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volumeLevel
  }, [])

  // playhead runs off requestAnimationFrame — the timeupdate event only fires
  // ~4x/sec, which looked choppy. The same loop covers a drag: while scrubbing it
  // follows the last pointer position instead of the audio clock.
  useEffect(() => {
    if (!isPlaying && !isScrubbing) return
    let frame
    const tick = () => {
      const audio = audioRef.current
      const scrub = scrubRef.current
      if (scrub.active) {
        const ratio = clampRatio(scrub.x, scrub.rect)
        // Coalesce to one seek per frame. Setting currentTime on every
        // pointermove queues a media seek per event, and that backlog is what
        // stalled the drag.
        if (ratio !== scrub.ratio) {
          scrub.ratio = ratio
          paintPlayhead(ratio)
          seekAudio(ratio)
        }
      } else if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        paintPlayhead(audio.currentTime / audio.duration)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, isScrubbing])

  function seekAudio(ratio) {
    const audio = audioRef.current
    if (!audio) return
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      // stop a hair short of the end so scrubbing to the far edge doesn't
      // trip 'ended' and bounce back to the start
      audio.currentTime = Math.min(ratio * audio.duration, audio.duration - 0.05)
      pendingSeekRef.current = null
    } else {
      // duration isn't known until the clip loads — apply the seek then
      pendingSeekRef.current = ratio
    }
  }

  function startScrub(event) {
    const stage = stageRef.current
    if (!stage) return
    event.currentTarget.setPointerCapture(event.pointerId)
    // The rect is measured once per drag. Reading it inside the move handler
    // forced a layout on every event.
    const rect = stage.getBoundingClientRect()
    const ratio = clampRatio(event.clientX, rect)
    scrubRef.current = { active: true, rect, x: event.clientX, ratio }
    // paint on pointer-down so the line is under the cursor before the loop starts
    paintPlayhead(ratio)
    seekAudio(ratio)
    setHasPosition(true)
    setIsScrubbing(true)
  }

  function moveScrub(event) {
    if (scrubRef.current.active) scrubRef.current.x = event.clientX
  }

  function endScrub() {
    if (!scrubRef.current.active) return
    scrubRef.current.active = false
    setIsScrubbing(false)
  }

  function applyPendingSeek() {
    const audio = audioRef.current
    if (audio && pendingSeekRef.current != null && Number.isFinite(audio.duration)) {
      audio.currentTime = pendingSeekRef.current * audio.duration
      pendingSeekRef.current = null
    }
  }

  return {
    segment,
    selectSegment,
    isPlaying,
    isScrubbing,
    hasPosition,
    audioRef,
    stageRef,
    trackRef,
    currentUrl,
    activeSegmentLabel,
    togglePlay,
    startScrub,
    moveScrub,
    endScrub,
    applyPendingSeek,
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onEnded: () => {
      setIsPlaying(false)
      setHasPosition(false)
      paintPlayhead(0)
    },
  }
}
