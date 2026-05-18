import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Loader2, Mail, Lock, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react'

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
        <main className="min-h-screen w-full bg-gray-50 p-3 sm:p-4">
            <div className="grid min-h-[calc(100vh-24px)] w-full overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-sm sm:min-h-[calc(100vh-32px)] lg:grid-cols-[1.05fr_0.95fr]">
                <section className="relative m-3 hidden overflow-hidden rounded-[24px] bg-gray-900 lg:block">
                    <img
                        src="/login.jpg"
                        alt="GAP FlowPilot workspace"
                        className="absolute inset-0 h-full w-full rounded-[24px] object-cover object-center"
                    />
                    <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-gray-950/80 via-gray-950/30 to-emerald-950/50" />

                    <div className="relative z-10 flex h-full flex-col justify-between rounded-[24px] p-8 xl:p-10">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                            <img src="/logo.png" alt="GAP FlowPilot" className="h-8 w-8 object-contain" />
                        </div>

                        <div className="max-w-xl rounded-[24px]">
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur">
                                <Sparkles className="h-3.5 w-3.5" />
                                GAP FlowPilot
                            </div>
                            <h1 className="max-w-lg text-5xl font-extrabold leading-[1.05] tracking-tight text-white xl:text-6xl">
                                Supercharge your WhatsApp outreach.
                            </h1>
                            <p className="mt-5 max-w-md text-base leading-7 text-white/82">
                                Automate conversations, manage teams, and keep customer follow-ups moving from one clean workspace.
                            </p>
                            <div className="mt-8 grid max-w-lg grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-white/10 p-4 text-white ring-1 ring-white/15 backdrop-blur">
                                    <MessageSquare className="mb-3 h-5 w-5 text-emerald-300" />
                                    <p className="text-sm font-semibold">Shared inbox</p>
                                    <p className="mt-1 text-xs leading-5 text-white/70">Client chats, summaries, and notes together.</p>
                                </div>
                                <div className="rounded-2xl bg-white/10 p-4 text-white ring-1 ring-white/15 backdrop-blur">
                                    <ShieldCheck className="mb-3 h-5 w-5 text-emerald-300" />
                                    <p className="text-sm font-semibold">GetAiPilot SSO</p>
                                    <p className="mt-1 text-xs leading-5 text-white/70">One session for connected services.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="flex min-h-[calc(100vh-24px)] items-center justify-center rounded-[24px] px-5 py-10 sm:px-8 lg:min-h-0 lg:px-12 xl:px-20">
                    <div className="w-full max-w-md rounded-[24px]">
                        <div className="mb-10 flex items-center gap-3 lg:hidden">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white">
                                <img src="/logo.png" alt="GAP FlowPilot" className="h-7 w-7 object-contain" />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-gray-950">GAP FlowPilot</p>
                                <p className="text-xs text-gray-500">WhatsApp workspace</p>
                            </div>
                        </div>

                        <div className="rounded-[24px]">
                            <p className="mb-3 text-sm font-semibold text-emerald-600">Welcome back</p>
                            <h2 className="text-4xl font-extrabold tracking-tight text-gray-950">Sign in</h2>
                            <p className="mt-3 text-sm leading-6 text-gray-500">
                                Use your <span className="font-semibold text-gray-800">GetAiPilot account</span> to continue to GAP FlowPilot.
                            </p>
                        </div>

                        <div className="mt-9 rounded-[24px]">
                            {error && (
                                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <form className="space-y-5 rounded-[24px]" onSubmit={handleSubmit}>
                                <label className="block rounded-2xl">
                                    <span className="mb-2 block text-sm font-semibold text-gray-800">Email address</span>
                                    <span className="relative block rounded-2xl">
                                        <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                        <input
                                            id="email"
                                            name="email"
                                            type="email"
                                            autoComplete="email"
                                            required
                                            className="h-[52px] w-full rounded-2xl border border-gray-200 bg-gray-50/70 py-3.5 pl-12 pr-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 hover:bg-white focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                                            placeholder="you@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </span>
                                </label>

                                <label className="block rounded-2xl">
                                    <span className="mb-2 block text-sm font-semibold text-gray-800">Password</span>
                                    <span className="relative block rounded-2xl">
                                        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                        <input
                                            id="password"
                                            name="password"
                                            type="password"
                                            autoComplete="current-password"
                                            required
                                            className="h-[52px] w-full rounded-2xl border border-gray-200 bg-gray-50/70 py-3.5 pl-12 pr-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 hover:bg-white focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
                                            placeholder="Enter password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                    </span>
                                </label>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm shadow-emerald-600/20 transition-all hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Log in to workspace'}
                                </button>
                            </form>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    )
}
