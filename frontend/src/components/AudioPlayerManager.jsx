import React, { createContext, useContext, useMemo, useRef, useState } from 'react'

const AudioPlayerContext = createContext(null)

export function AudioPlayerProvider({ children }) {
  const registryRef = useRef(new Map())
  const [currentId, setCurrentId] = useState(null)

  const api = useMemo(() => {
    return {
      currentId,
      register: (id, controls) => {
        if (!id) return
        registryRef.current.set(String(id), controls)
      },
      unregister: (id) => {
        if (!id) return
        const key = String(id)
        registryRef.current.delete(key)
        setCurrentId((prev) => (prev === key ? null : prev))
      },
      requestPlay: (id) => {
        const nextId = String(id)
        if (currentId && currentId !== nextId) {
          const prev = registryRef.current.get(currentId)
          try {
            prev?.pause?.()
          } catch {
            // ignore
          }
        }
        setCurrentId(nextId)
      },
      notifyPause: (id) => {
        const key = String(id)
        setCurrentId((prev) => (prev === key ? null : prev))
      },
    }
  }, [currentId])

  return <AudioPlayerContext.Provider value={api}>{children}</AudioPlayerContext.Provider>
}

export function useAudioPlayerManager() {
  const ctx = useContext(AudioPlayerContext)
  if (!ctx) {
    throw new Error('useAudioPlayerManager must be used within AudioPlayerProvider')
  }
  return ctx
}
