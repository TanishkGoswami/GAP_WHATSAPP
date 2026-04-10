import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Volume2 } from 'lucide-react'
import { useAudioPlayerManager } from './AudioPlayerManager'

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function AudioMessageBubble({
  id,
  mediaUrl,
  durationSeconds,
  isMine,
  status,
}) {
  const audioRef = useRef(null)
  const barRef = useRef(null)
  const manager = useAudioPlayerManager()

  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0)
  const [speed, setSpeed] = useState(1)

  const progressPct = useMemo(() => {
    if (!duration) return 0
    return Math.max(0, Math.min(100, (currentTime / duration) * 100))
  }, [currentTime, duration])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onLoaded = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0
      setDuration((prev) => (prev > 0 ? prev : d))
      setIsReady(true)
    }
    const onTime = () => setCurrentTime(audio.currentTime || 0)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
      try {
        audio.currentTime = 0
      } catch {
        // ignore
      }
      manager.notifyPause(id)
    }

    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
    }
  }, [id, manager])

  useEffect(() => {
    manager.register(id, {
      pause: () => {
        const a = audioRef.current
        if (!a) return
        a.pause()
      },
    })

    return () => {
      manager.unregister(id)
    }
  }, [id, manager])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.playbackRate = speed
  }, [speed])

  const togglePlay = async () => {
    const a = audioRef.current
    if (!a) return

    if (a.paused) {
      manager.requestPlay(id)
      try {
        await a.play()
      } catch {
        // Autoplay blocked or load error
      }
    } else {
      a.pause()
      manager.notifyPause(id)
    }
  }

  const seekToPct = (clientX) => {
    const el = barRef.current
    const a = audioRef.current
    if (!el || !a || !duration) return

    const rect = el.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const nextTime = pct * duration
    a.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const onBarPointerDown = (e) => {
    if (!isReady) return
    seekToPct(e.clientX)

    const move = (ev) => seekToPct(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const cycleSpeed = () => {
    setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))
  }

  const bg = isMine ? 'bg-[#cfeec6]' : 'bg-white'
  const border = isMine ? 'border-green-200' : 'border-gray-200'

  return (
    <div className={`w-full rounded-xl border ${border} ${bg} px-3 py-2`}> 
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className={`h-9 w-9 rounded-full flex items-center justify-center transition-colors ${
            isMine ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div
            ref={barRef}
            onPointerDown={onBarPointerDown}
            className={`h-2 rounded-full relative cursor-pointer select-none ${
              isMine ? 'bg-green-200' : 'bg-gray-200'
            } ${!isReady ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div
              className={`absolute left-0 top-0 h-2 rounded-full ${isMine ? 'bg-green-600' : 'bg-gray-500'}`}
              style={{ width: `${progressPct}%` }}
            />
            <div
              className={`absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full ${isMine ? 'bg-green-700' : 'bg-gray-700'}`}
              style={{ left: `calc(${progressPct}% - 6px)` }}
            />
          </div>

          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-600">
            <span className="tabular-nums">{formatTime(currentTime)} / {formatTime(duration)}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cycleSpeed}
                className="px-2 py-0.5 rounded-md border border-gray-200 bg-white/60 hover:bg-white text-[11px] font-semibold"
                title="Playback speed"
              >
                {speed}x
              </button>
              {status ? (
                <span className="hidden sm:inline-flex items-center gap-1 text-gray-400">
                  <Volume2 className="h-3 w-3" />
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={mediaUrl} preload="metadata" />
    </div>
  )
}
