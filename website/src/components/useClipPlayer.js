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

// Drives one spectrogram clip: play/pause, drag-to-seek, and the playhead.
// The card and the expanded modal each mount their own instance (own <audio>),
// so togglePlay pauses every other <audio> on the page before starting this one
// — that's what keeps a single clip playing at a time across the whole gallery.
export function useClipPlayer(detection) {
  const [segment, setSegment] = useState('during')
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const audioRef = useRef(null)
  const stageRef = useRef(null)
  const pendingSeekRef = useRef(null)

  const currentUrl = detection[`${segment}ClipUrl`]
  const activeSegmentLabel = SEGMENTS.find((s) => s.key === segment)?.label

  function selectSegment(key) {
    if (key === segment) return
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    pendingSeekRef.current = null
    setIsPlaying(false)
    setProgress(0)
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

  // playhead runs off requestAnimationFrame while playing — the timeupdate
  // event only fires ~4x/sec, which looked choppy
  useEffect(() => {
    if (!isPlaying) return
    let frame
    const tick = () => {
      const audio = audioRef.current
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        setProgress(audio.currentTime / audio.duration)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying])

  function seekToClientX(clientX) {
    const stage = stageRef.current
    const audio = audioRef.current
    if (!stage || !audio) return
    const rect = stage.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    setProgress(ratio)
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
    setIsScrubbing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    seekToClientX(event.clientX)
  }

  function moveScrub(event) {
    if (isScrubbing) seekToClientX(event.clientX)
  }

  function endScrub() {
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
    onPlay: () => setIsPlaying(true),
    onPause: () => setIsPlaying(false),
    onEnded: () => {
      setIsPlaying(false)
      setProgress(0)
    },
  }
}
