import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState(null)
    const [memberProfile, setMemberProfile] = useState(null)

    const fetchMemberProfile = async (token) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/team/my-profile`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setUserRole(data?.role || 'owner')
                setMemberProfile(data)
            }
        } catch (e) {
            console.error("Failed to fetch member profile", e)
        }
    }

    useEffect(() => {
        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session ?? null)
            setUser(session?.user ?? null)
            setLoading(false)
        })

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session ?? null)
            setUser(session?.user ?? null)
            setLoading(false)
        })

        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (session?.access_token) {
            fetchMemberProfile(session.access_token)
        } else {
            setUserRole(null)
            setMemberProfile(null)
        }
    }, [session])

    const value = {
        signUp: (data) => supabase.auth.signUp(data),
        signIn: (data) => supabase.auth.signInWithPassword(data),
        signInWithGoogle: () => supabase.auth.signInWithOAuth({ 
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/dashboard`
            }
        }),
        signOut: () => {
            setUserRole(null)
            setMemberProfile(null)
            return supabase.auth.signOut()
        },
        user,
        session,
        userRole,
        memberProfile
    }

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
