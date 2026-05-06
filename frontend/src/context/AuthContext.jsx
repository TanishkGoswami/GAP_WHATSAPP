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
    const [loginType, setLoginType] = useState(localStorage.getItem('auth_login_type') || 'owner')

    const fetchMemberProfile = async (token) => {
        try {
            const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api/team/my-profile`, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'X-Auth-Portal': loginType
                }
            })
            if (res.ok) {
                const data = await res.json()
                // If loginType is owner, we prefer 'owner' role unless DB says otherwise
                // But usually if they login via owner portal, we treat them as owner if profile is missing
                const role = data?.role || (loginType === 'agent' ? 'agent' : 'owner')
                console.log("Profile Data:", data, "Resolved Role:", role, "Login Type:", loginType)
                setUserRole(role)
                setMemberProfile(data)
            } else {
                // If profile not found, use loginType to decide default
                setUserRole(loginType === 'agent' ? 'agent' : 'owner')
            }
        } catch (e) {
            console.error("Failed to fetch member profile", e)
            setUserRole(loginType === 'agent' ? 'agent' : 'owner')
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
    }, [session, loginType])

    const value = {
        signUp: (data) => supabase.auth.signUp(data),
        signIn: async (data, type = 'owner') => {
            setLoginType(type)
            localStorage.setItem('auth_login_type', type)
            return supabase.auth.signInWithPassword(data)
        },
        signInWithGoogle: () => supabase.auth.signInWithOAuth({ 
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/dashboard`
            }
        }),
        signOut: () => {
            setUserRole(null)
            setMemberProfile(null)
            localStorage.removeItem('auth_login_type')
            return supabase.auth.signOut()
        },
        user,
        session,
        userRole,
        memberProfile,
        loginType
    }

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
