import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2, Mail, Lock, UserCheck, Eye, EyeOff } from 'lucide-react'

export default function AgentLogin() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const { signIn } = useAuth()
    const navigate = useNavigate()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            const { error } = await signIn({ email, password }, 'agent')
            if (error) throw error
            navigate('/') // The auth middleware will route them appropriately
        } catch (err) {
            if (err.message.includes('Invalid login credentials')) {
                setError("Agent ID does not exist (may be deleted). Ask your owner for valid ID and password.");
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen">
            {/* Left Panel - Branding */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-900 to-purple-800 p-12 flex-col justify-between relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-16">
                        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md shadow-lg border border-white/20">
                            <UserCheck className="w-7 h-7 text-white drop-shadow-md" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">FlowsApp</h1>
                            <p className="text-indigo-300 text-sm font-medium tracking-wide uppercase">Agent Portal</p>
                        </div>
                    </div>
                    
                    <h2 className="text-5xl font-extrabold text-white leading-tight mb-6">
                        Manage Customer<br/>Chats Efficiently
                    </h2>
                    <p className="text-indigo-100 text-lg max-w-md leading-relaxed">
                        Log in to your agent workspace to handle live chats, trigger automated flows, and assist customers in real-time.
                    </p>
                </div>
            </div>

            {/* Right Panel - Form */}
            <div className="flex-1 flex flex-col justify-center px-4 sm:px-12 lg:px-24 bg-white relative">
                <div className="mx-auto w-full max-w-sm lg:max-w-md">
                    
                    {/* Mobile Header */}
                    <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
                        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                            <UserCheck className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-xl font-bold text-gray-900 leading-none">FlowsApp</h1>
                            <span className="text-indigo-600 text-[11px] font-bold tracking-wider uppercase mt-1">Agent Portal</span>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-gray-900">Agent Login</h2>
                        <p className="mt-2 text-sm text-gray-500">
                            Sign in with the credentials provided by your organization owner.
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
                                    Agent Email
                                </label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                    </div>
                                    <input
                                        id="email"
                                        name="email"
                                        type="email"
                                        autoComplete="email"
                                        required
                                        className="block w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-gray-50/50 hover:bg-white"
                                        placeholder="agent@example.com"
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
                                        <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                    </div>
                                    <input
                                        id="password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="current-password"
                                        required
                                        className="block w-full pl-11 pr-11 py-3 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all bg-gray-50/50 hover:bg-white"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-gradient-to-br from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all active:scale-[0.98]"
                            >
                                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : 'Log in as Agent'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}
