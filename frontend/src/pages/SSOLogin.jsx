import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Loader2, MessageSquare } from 'lucide-react'

export default function SSOLogin() {
    const navigate = useNavigate()
    const [error, setError] = useState(null)

    useEffect(() => {
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (!accessToken || !refreshToken) {
            setError('Invalid SSO link. Please log in manually.')
            return
        }

        supabase.auth
            .setSession({ access_token: accessToken, refresh_token: refreshToken })
            .then(({ error }) => {
                if (error) {
                    setError('Session expired. Please log in manually.')
                } else {
                    navigate('/dashboard', { replace: true })
                }
            })
    }, [navigate])

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
                <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-sm w-full text-center">
                    <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="text-red-400" size={22} />
                    </div>
                    <p className="text-gray-700 font-medium mb-2">Auto-login failed</p>
                    <p className="text-sm text-gray-400 mb-6">{error}</p>
                    <a
                        href="/login"
                        className="block w-full py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors"
                    >
                        Go to Login
                    </a>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
            <div className="text-center">
                <Loader2 className="animate-spin text-emerald-500 mx-auto mb-3" size={32} />
                <p className="text-gray-500 text-sm font-medium">Logging you in...</p>
            </div>
        </div>
    )
}
