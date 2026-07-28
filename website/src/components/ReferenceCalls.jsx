import { Fragment, useEffect, useRef, useState } from 'react'
import { getVolume } from './useClipPlayer'
import './ReferenceCalls.css'

const CATEGORIES = [
  { key: 'song', label: 'Song' },
  { key: 'call', label: 'Call' },
  { key: 'warning', label: 'Warning' },
]

// The Song / Call / Warning reference boxes beside the species name. Each plays
// a known Xeno-canto example of that call type so the reviewer can compare it
// against the detection. Tapping a category plays its best clip; if there's a
// second take, an "Alternative" box appears next to it to play the other one.
// Tapping the box that's already selected replays it. Only one sound plays at a
// time across the whole page, so a reference hushes any clip (and vice versa).
// `calls` is { song?, call?, warning? }, each an array (best first) of
// { url, recordist, license, sourceUrl }.
function ReferenceCalls({ calls, speciesCommonName }) {
  // Which clip is loaded — its category key and index within that category's
  // list — and whether it's sounding. The <audio> src is React-driven off
  // `active` (like the clip player swaps segments); playback is then kicked off
  // imperatively.
  const [active, setActive] = useState(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  const wantPlayRef = useRef(false)

  // Once the browser has swapped in the newly selected src, start it from the
  // top. Only fires for a genuine change of clip, not a replay of the same one.
  useEffect(() => {
    if (!active || !wantPlayRef.current) return
    wantPlayRef.current = false
    const audio = audioRef.current
    audio.volume = getVolume()
    audio.currentTime = 0
    audio.play()
  }, [active])

  function play(key, index) {
    if (!calls?.[key]?.[index]) return
    const audio = audioRef.current
    // Hush every other clip and the sibling reference boxes first.
    document.querySelectorAll('audio').forEach((el) => {
      if (el !== audio) el.pause()
    })
    if (active && active.key === key && active.index === index) {
      // Same box tapped again — replay from the start.
      audio.volume = getVolume()
      audio.currentTime = 0
      audio.play()
    } else {
      wantPlayRef.current = true
      setActive({ key, index })
    }
  }

  const activeEntry = playing && active ? calls[active.key][active.index] : null

  return (
    <div
      className="reference-calls"
      role="group"
      aria-label={`Reference calls for ${speciesCommonName}`}
    >
      <div className="ref-boxes">
        {CATEGORIES.map((c) => {
          const list = calls?.[c.key]
          const available = Boolean(list && list.length)
          const isActiveCat = active?.key === c.key
          const hasAlt = Boolean(list && list.length > 1)
          const primaryPlaying = playing && isActiveCat && active.index === 0
          const altPlaying = playing && isActiveCat && active.index === 1
          // The active pair reads as a unit: whichever take is sounding turns
          // orange, and its sibling turns ink-black so the two stand apart from
          // the grey, untouched categories.
          const primaryPaired = isActiveCat && hasAlt && !primaryPlaying
          return (
            <Fragment key={c.key}>
              <button
                type="button"
                className={`ref-box${primaryPlaying ? ' is-playing' : primaryPaired ? ' is-paired' : ''}`}
                disabled={!available}
                aria-pressed={primaryPlaying}
                title={available ? tooltip(c.label, list[0]) : `No reference ${c.key} yet`}
                onClick={() => play(c.key, 0)}
              >
                <span className="ref-label">{c.label}</span>
                <span className="ref-bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </button>

              {/* The alternate take, offered next to its category once that
                  category is the active one and it actually has a second clip. */}
              {isActiveCat && hasAlt && (
                <button
                  type="button"
                  className={`ref-box${altPlaying ? ' is-playing' : ' is-paired'}`}
                  aria-pressed={altPlaying}
                  title={tooltip(`Alternative ${c.label.toLowerCase()}`, list[1])}
                  onClick={() => play(c.key, 1)}
                >
                  <span className="ref-label">Alternative</span>
                  <span className="ref-bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </button>
              )}
            </Fragment>
          )
        })}
      </div>

      {/* Xeno-canto clips are Creative Commons, so credit the recordist of
          whichever take is playing. The line is always in the DOM (reserved
          height) so it appears without nudging the heading. */}
      <p className="ref-credit" aria-live="polite">
        {activeEntry && (
          <>
            {activeEntry.recordist ? `Rec. ${activeEntry.recordist}` : 'Xeno-canto'}
            {activeEntry.license ? ` · ${activeEntry.license}` : ''}
            {activeEntry.sourceUrl && (
              <>
                {' · '}
                <a href={activeEntry.sourceUrl} target="_blank" rel="noreferrer">
                  Xeno-canto
                </a>
              </>
            )}
          </>
        )}
      </p>

      <audio
        ref={audioRef}
        src={active ? calls[active.key][active.index].url : undefined}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}

function tooltip(label, entry) {
  const parts = [`${label} reference`]
  if (entry.recordist) parts.push(`recorded by ${entry.recordist}`)
  if (entry.license) parts.push(entry.license)
  parts.push('via Xeno-canto')
  return parts.join(' — ')
}

export default ReferenceCalls
