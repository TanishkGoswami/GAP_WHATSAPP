import { useRef, useState, useEffect, useCallback } from 'react'

const MUTE_STORAGE_KEY = 'gap_notification_muted'
const RATE_LIMIT_MS = 2000 // minimum gap between two sounds

/**
 * useNotificationSound
 *
 * WhatsApp-style notification sound system using Web Audio API.
 * - No external file dependency (sound is generated programmatically)
 * - Handles browser autoplay policy (unlocks on first user gesture)
 * - Rate-limited to prevent spam
 * - Mute state persisted in localStorage
 */
export function useNotificationSound() {
    const audioCtxRef = useRef(null)
    const unlockedRef = useRef(false)
    const lastPlayedRef = useRef(0)

    const [isMuted, setIsMuted] = useState(() => {
        try {
            return localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
        } catch {
            return false
        }
    })

    // Keep a ref in sync so the play function always reads the latest value
    const isMutedRef = useRef(isMuted)
    useEffect(() => {
        isMutedRef.current = isMuted
    }, [isMuted])

    // ------------------------------------------------------------------
    // Create / lazily initialise AudioContext
    // ------------------------------------------------------------------
    const getAudioContext = useCallback(() => {
        if (!audioCtxRef.current) {
            try {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
            } catch (err) {
                console.warn('[NotificationSound] AudioContext not supported:', err)
                return null
            }
        }
        return audioCtxRef.current
    }, [])

    // ------------------------------------------------------------------
    // Unlock AudioContext on first user gesture
    // (Modern browsers block audio until a user interaction has occurred)
    // ------------------------------------------------------------------
    useEffect(() => {
        const unlock = async () => {
            if (unlockedRef.current) return
            const ctx = getAudioContext()
            if (!ctx) return
            if (ctx.state === 'suspended') {
                try {
                    await ctx.resume()
                } catch {
                    // silent fail
                }
            }
            unlockedRef.current = true
        }

        document.addEventListener('click', unlock, { once: true })
        document.addEventListener('keydown', unlock, { once: true })
        document.addEventListener('touchstart', unlock, { once: true })

        return () => {
            document.removeEventListener('click', unlock)
            document.removeEventListener('keydown', unlock)
            document.removeEventListener('touchstart', unlock)
        }
    }, [getAudioContext])

    // ------------------------------------------------------------------
    // Play a WhatsApp-like "ting" notification sound
    // ------------------------------------------------------------------
    const playNotification = useCallback(async () => {
        if (isMutedRef.current) return

        // Rate limit — don't play more than once every RATE_LIMIT_MS
        const now = Date.now()
        if (now - lastPlayedRef.current < RATE_LIMIT_MS) return
        lastPlayedRef.current = now

        const ctx = getAudioContext()
        if (!ctx) return

        // Unlock if still suspended (e.g. first programmatic call before user click)
        if (ctx.state === 'suspended') {
            try {
                await ctx.resume()
            } catch {
                return // cannot play — autoplay still blocked
            }
        }

        try {
            const currentTime = ctx.currentTime

            // --- Gain node (volume envelope) ---
            const gainNode = ctx.createGain()
            gainNode.gain.setValueAtTime(0, currentTime)
            gainNode.gain.linearRampToValueAtTime(0.35, currentTime + 0.005)  // quick attack
            gainNode.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.28) // smooth decay
            gainNode.connect(ctx.destination)

            // --- Primary tone: high-pitched ping ---
            const osc1 = ctx.createOscillator()
            osc1.type = 'sine'
            osc1.frequency.setValueAtTime(1320, currentTime)           // E6
            osc1.frequency.exponentialRampToValueAtTime(880, currentTime + 0.12) // A5
            osc1.connect(gainNode)
            osc1.start(currentTime)
            osc1.stop(currentTime + 0.3)

            // --- Secondary overtone for richness ---
            const gainNode2 = ctx.createGain()
            gainNode2.gain.setValueAtTime(0, currentTime)
            gainNode2.gain.linearRampToValueAtTime(0.12, currentTime + 0.005)
            gainNode2.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.2)
            gainNode2.connect(ctx.destination)

            const osc2 = ctx.createOscillator()
            osc2.type = 'sine'
            osc2.frequency.setValueAtTime(2640, currentTime)           // E7 (octave overtone)
            osc2.frequency.exponentialRampToValueAtTime(1760, currentTime + 0.1)
            osc2.connect(gainNode2)
            osc2.start(currentTime)
            osc2.stop(currentTime + 0.2)

        } catch (err) {
            console.warn('[NotificationSound] playback error:', err)
        }
    }, [getAudioContext])

    // ------------------------------------------------------------------
    // Toggle mute
    // ------------------------------------------------------------------
    const toggleMute = useCallback(() => {
        setIsMuted(prev => {
            const next = !prev
            try {
                localStorage.setItem(MUTE_STORAGE_KEY, String(next))
            } catch {
                // ignore
            }
            return next
        })
    }, [])

    return { playNotification, isMuted, toggleMute }
}
