import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2, Mail, Lock, MessageSquare } from 'lucide-react'

export default function Login() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { signIn } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            const { error } = await signIn({ email, password }, 'owner')
            if (error) throw error
            navigate('/')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }



    return (
        <div className="flex min-h-screen bg-gray-50 items-center justify-center p-4 sm:p-6 lg:p-8">
            <div className="flex w-full max-w-6xl bg-white rounded-3xl shadow-xl overflow-hidden min-h-[600px] lg:min-h-[700px] border border-gray-100">
                {/* Left Panel - login.png image */}
                <div className="hidden lg:flex lg:w-1/2 relative p-4 flex-col justify-between">
                    {/* Full cover image with radius */}
                    <img
                        src="/login.jpg"
                        alt="Login Visual"
                        className="absolute inset-4 w-[calc(100%-32px)] h-[calc(100%-32px)] object-cover object-center rounded-2xl"
                    />
                    {/* Subtle dark overlay for text readability */}
                    <div className="absolute inset-4 w-[calc(100%-32px)] h-[calc(100%-32px)] bg-black/25 rounded-2xl" />

                    {/* Top: Logo */}
                    <div className="relative z-10 p-6">
                        <img src="/logo.png" alt="FLOWSAPP" className="h-10 w-auto object-contain drop-shadow-lg" />
                    </div>

                    {/* Bottom: Tagline */}
                    <div className="relative z-10 p-6">
                        <h2 className="text-4xl font-extrabold text-white leading-tight mb-3 drop-shadow-md">
                            Supercharge Your<br/>WhatsApp Outreach
                        </h2>
                        <p className="text-white/90 text-base max-w-sm leading-relaxed drop-shadow-sm">
                            Deploy intelligent chatbots, manage infinite conversations, and blast targeted broadcasts simultaneously.
                        </p>
                        <div className="flex items-center gap-3 mt-6 text-white/80 text-sm font-medium">
                            <div className="flex -space-x-2">
                                <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white/30 flex items-center justify-center text-white"><MessageSquare size={13}/></div>
                                <div className="w-8 h-8 rounded-full bg-emerald-400 border-2 border-white/30 flex items-center justify-center text-white"><MessageSquare size={13}/></div>
                                <div className="w-8 h-8 rounded-full bg-emerald-300 border-2 border-white/30 flex items-center justify-center text-emerald-900"><MessageSquare size={13}/></div>
                            </div>
                            <span>Trusted by thousands of businesses</span>
                        </div>
                    </div>
                </div>

                {/* Right Panel - Form */}
                <div className="flex-1 flex flex-col justify-center px-4 sm:px-12 lg:px-20 bg-white relative">
                    <div className="mx-auto w-full max-w-sm lg:max-w-md">
                        
                        {/* Mobile Header */}
                        <div className="lg:hidden flex items-center justify-center mb-8">
                            <img src="/logo.png" alt="FLOWSAPP" className="h-10 w-auto object-contain" />
                        </div>

                        <div>
                            <h2 className="text-3xl font-bold tracking-tight text-gray-900">Welcome back</h2>
                            <p className="mt-2 text-sm text-gray-500">
                                Please sign in with your <span className="font-semibold text-gray-800">GetAiPilot account</span> to access the WhatsApp workspace.
                            </p>
                        </div>

                        <div className="mt-8">
                            {error && (
                                <div className="mb-6 rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600 shadow-sm flex items-center gap-3">
                                    <div className="p-1 bg-red-100 rounded-full shrink-0"><Lock size={14} className="text-red-600"/></div>
                                    {error}
                                </div>
                            )}

                            <form className="space-y-5" onSubmit={handleSubmit}>
                                <div>
                                    <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Email address
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                                        </div>
                                        <input
                                            id="email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            className="block w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-gray-50/50 hover:bg-white"
                                            placeholder="you@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Password
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                                        </div>
                                        <input
                                            id="password"
                                            name="password"
                                            type="password"
                                            autoComplete="current-password"
                                            required
                                            className="block w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all bg-gray-50/50 hover:bg-white"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                                >
                                    {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Log in to Workspace'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
