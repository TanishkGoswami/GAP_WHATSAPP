import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'

const AuthContext = createContext({})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState(null)
    const [memberProfile, setMemberProfile] = useState(null)
    const [isProfileLoading, setIsProfileLoading] = useState(false)
    const fetchedForUserId = useRef(null) // tracks which user we last fetched profile for
    const [loginType, setLoginType] = useState(localStorage.getItem('auth_login_type') || 'owner')

    const fetchMemberProfile = async (token, userId) => {
        // Avoid re-fetching on TOKEN_REFRESHED (tab focus) — only fetch when user actually changes
        if (fetchedForUserId.current === userId && userRole !== null) return
        fetchedForUserId.current = userId
        setIsProfileLoading(true)
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
        } finally {
            setIsProfileLoading(false)
        }
    }

    useEffect(() => {
        // Initial session load — sets loading=false exactly once
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session ?? null)
            setUser(session?.user ?? null)
            setLoading(false)
        })

        // Listen for auth state changes (login, logout, token refresh on tab focus, etc.)
        // Do NOT call setLoading here — it causes children to unmount/remount on
        // TOKEN_REFRESHED events (tab switching), wiping form state in child pages.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('Auth state change:', event, session?.user?.email);
            setSession(session ?? null)
            setUser(session?.user ?? null)

            // Handle token refresh
            if (event === 'TOKEN_REFRESHED' && session) {
                console.log('Token refreshed successfully');
            }

            // Handle sign out on token expiry
            if (event === 'SIGNED_OUT') {
                console.log('User signed out');
                setUserRole(null)
                setMemberProfile(null)
                setIsProfileLoading(false)
                fetchedForUserId.current = null
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (session?.access_token && session?.user?.id) {
            fetchMemberProfile(session.access_token, session.user.id)
        } else if (!session) {
            // Logged out — reset everything
            fetchedForUserId.current = null
            setUserRole(null)
            setMemberProfile(null)
            setIsProfileLoading(false)
        }
    }, [session?.user?.id, loginType])

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
        // Utility function for API calls with automatic token refresh
        apiCall: async (url, options = {}) => {
            const makeRequest = async (retryCount = 0, tokenOverride = null) => {
                try {
                    let { data: { session: currentSession } } = await supabase.auth.getSession()
                    const expiresAtMs = currentSession?.expires_at ? currentSession.expires_at * 1000 : null
                    const isExpiring = expiresAtMs && expiresAtMs < Date.now() + 60_000

                    if (!tokenOverride && isExpiring) {
                        console.log('Token expired or expiring soon, refreshing before request...')
                        const { data, error } = await supabase.auth.refreshSession()
                        if (error) throw error
                        currentSession = data.session
                        if (data.session) {
                            setSession(data.session)
                            setUser(data.session.user)
                        }
                    }

                    const token = tokenOverride || currentSession?.access_token || session?.access_token;
                    if (!token) throw new Error('No session token');
                    const headers = {
                        'Authorization': `Bearer ${token}`,
                        'X-Auth-Portal': loginType || 'owner',
                        ...options.headers
                    }

                    if (!(options.body instanceof FormData)) {
                        headers['Content-Type'] = 'application/json'
                    }

                    const response = await fetch(url, {
                        ...options,
                        headers
                    });

                    // If 401, try to refresh token once
                    if (response.status === 401 && retryCount === 0) {
                        console.log('Token expired, attempting refresh...');
                        const { data, error } = await supabase.auth.refreshSession();
                        if (error) throw error;
                        if (data.session) {
                            setSession(data.session);
                            setUser(data.session.user);
                            // Retry the request with new token
                            return makeRequest(1, data.session.access_token);
                        }
                    }

                    return response;
                } catch (error) {
                    console.error('API call error:', error);
                    throw error;
                }
            };

            return makeRequest();
        },
        user,
        session,
        userRole,
        memberProfile,
        isProfileLoading,
        loginType
    }

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    )
}
