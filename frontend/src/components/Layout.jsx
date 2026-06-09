import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import Sidebar from './Sidebar'
import Modal from './Modal'
import { Bell, User, LogOut, AlertCircle, Save, Loader2, Mail, Shield, ExternalLink, Menu, Moon, SunMedium } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const NIGHT_LIGHT_KEY = 'gap_night_light_enabled'

export default function Layout() {
    const { user, userRole, loading, isProfileLoading, memberProfile, signOut, updateMyProfile } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)
    const [isProfileOpen, setIsProfileOpen] = useState(false)
    const [isSavingProfile, setIsSavingProfile] = useState(false)
    const [profileError, setProfileError] = useState('')
    const [profileDraft, setProfileDraft] = useState({ name: '', avatar_color: '#4f46e5' })
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
    const [isNightLight, setIsNightLight] = useState(() => localStorage.getItem(NIGHT_LIGHT_KEY) === 'true')

    const isOwner = userRole === 'owner'
    const isLiveChat = location.pathname === '/live-chat'
    const isFlowBuilder = location.pathname.startsWith('/flow-builder')
    const displayName = memberProfile?.name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User'
    const avatarColor = memberProfile?.avatar_color || user?.user_metadata?.avatar_color || '#4f46e5'
    const userEmail = memberProfile?.email || user?.email || ''
    const roleLabel = userRole ? userRole.charAt(0).toUpperCase() + userRole.slice(1) : 'User'
    const avatarInitials = useMemo(() => {
        const parts = String(displayName || 'User').trim().split(/\s+/).filter(Boolean)
        return (parts[0]?.[0] || 'U') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
    }, [displayName])

    useEffect(() => {
        if (!isProfileOpen) return
        setProfileDraft({
            name: displayName,
            avatar_color: avatarColor,
        })
        setProfileError('')
    }, [isProfileOpen, displayName, avatarColor])

    useEffect(() => {
        setIsMobileNavOpen(false)
    }, [location.pathname])

    useEffect(() => {
        document.documentElement.classList.toggle('fp-night-light', isNightLight)
        localStorage.setItem(NIGHT_LIGHT_KEY, String(isNightLight))
        localStorage.removeItem('gap_appearance_mode')
    }, [isNightLight])

    const planName = String(user?.plan || '').toLowerCase();
    const isWhatsAppPlan = planName.includes('whatsapp') || planName.includes('ultimate') || planName.includes('ecosystem') || planName.includes('all_in_one') || planName.includes('bundle') || planName.includes('starter') || planName.includes('growth') || planName.includes('pro');
    const hasActiveSubscription = user?.subscription_status === 'active' && isWhatsAppPlan;

    const handleDirectLogout = async () => {
        setIsLoggingOut(true);
        try {
            await signOut();
            navigate('/login');
        } catch (err) {
            console.error('Logout error:', err);
            navigate('/login');
        } finally {
            setIsLoggingOut(false);
        }
    };

    if (loading || !user?.subscription_checked) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        )
    }

    if (!user) return <Navigate to="/login" replace />
    if (userRole === null) return null

    if (!hasActiveSubscription) {
        return (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-emerald-50 p-4 font-sans z-[9999]">
                <div className="w-full max-w-lg bg-white/85 backdrop-blur-md rounded-3xl border border-gray-200/80 shadow-2xl p-8 sm:p-10 flex flex-col items-center text-center">
                    {/* Logo */}
                    <div className="h-16 w-16 bg-gradient-to-tr from-indigo-500 to-purple-600 text-white rounded-2xl flex items-center justify-center mb-6 shadow-lg rotate-3 hover:rotate-0 transition-transform duration-300">
                        <img src="/logo.png" alt="GetAiPilot" className="h-9 w-9 object-contain" />
                    </div>
                    
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">GAP WhatsApp Access Locked</h2>
                    <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-sm">
                        An active WhatsApp Starter, Growth, Pro, or All-in-One plan subscription is required to access your WhatsApp automations.
                    </p>

                    {/* Features Locker Info */}
                    <div className="w-full bg-slate-50/80 rounded-2xl border border-slate-100 p-5 my-6 text-left space-y-3.5">
                        <div className="flex items-start gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">✓</span>
                            <div>
                                <p className="text-sm font-bold text-gray-900 leading-none">Official Meta Cloud API Connection</p>
                                <p className="text-xs text-gray-500 mt-1">Connect official business numbers or QR sessions securely.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">✓</span>
                            <div>
                                <p className="text-sm font-bold text-gray-900 leading-none">AI Chatbots & Interactive Flows</p>
                                <p className="text-xs text-gray-500 mt-1">Deploy automated answers and visual multi-step dialogs.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold">✓</span>
                            <div>
                                <p className="text-sm font-bold text-gray-900 leading-none">Broadcasts & Campaigns</p>
                                <p className="text-xs text-gray-500 mt-1">Send bulk marketing/notification messages using approved templates.</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        <a
                            href="https://getaipilot.in/pricing"
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-md shadow-indigo-100"
                        >
                            Upgrade Plan / Unlock Now
                            <ExternalLink className="h-4 w-4" />
                        </a>
                        <button
                            type="button"
                            onClick={handleDirectLogout}
                            disabled={isLoggingOut}
                            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                            {isLoggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log Out of Session'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Redirect non-owners to live-chat if they try to access restricted paths
    if (!isOwner && location.pathname !== '/live-chat') {
        return <Navigate to="/live-chat" replace />
    }

    const handleLogoutClick = () => {
        setIsLogoutConfirmOpen(true)
    }

    const handleConfirmLogout = async () => {
        setIsLoggingOut(true)
        try {
            await signOut()
            setIsLogoutConfirmOpen(false)
            navigate('/login')
        } catch (err) {
            console.error('Logout error:', err)
            // Even if it fails on server, we should usually force a redirect or clear local state
            setIsLogoutConfirmOpen(false)
            navigate('/login')
        } finally {
            setIsLoggingOut(false)
        }
    }

    const handleContinueToGetAiPilot = () => {
        setIsLogoutConfirmOpen(false)
        window.location.href = 'https://getaipilot.in'
    }

    const handleCancelLogout = () => {
        setIsLogoutConfirmOpen(false)
    }

    const avatarColors = ['#4f46e5', '#16a34a', '#0891b2', '#dc2626', '#db2777', '#ea580c']

    const handleSaveProfile = async (e) => {
        e.preventDefault()
        const name = profileDraft.name.trim()
        if (!name) {
            setProfileError('Name is required.')
            return
        }
        setIsSavingProfile(true)
        setProfileError('')
        try {
            await updateMyProfile({
                name,
                avatar_color: profileDraft.avatar_color
            })
            setIsProfileOpen(false)
        } catch (err) {
            setProfileError(err?.message || 'Failed to update profile.')
        } finally {
            setIsSavingProfile(false)
        }
    }

    return (
        <div className="fixed inset-0 flex min-w-0 bg-[#f5f7fa]">
            <Sidebar
                onRequestLogout={handleLogoutClick}
                isMobileOpen={isMobileNavOpen}
                onMobileClose={() => setIsMobileNavOpen(false)}
            />

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Topbar */}
                <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-3 sm:h-16 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setIsMobileNavOpen(true)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 md:hidden"
                            aria-label="Open navigation"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                        <div className="flex min-w-0 items-center gap-2 md:hidden">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-gray-200">
                                <img src="/logo.png" alt="GetAiPilot" className="h-5 w-5 object-contain" />
                            </span>
                            <span className="truncate text-sm font-semibold text-gray-900">GetAiPilot</span>
                        </div>
                    </div>

                    <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsNightLight(prev => !prev)}
                                className={`relative inline-flex h-9 w-[86px] items-center rounded-full border p-1 transition-all duration-300 ease-out ${
                                    isNightLight
                                        ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                }`}
                                aria-label={isNightLight ? 'Switch to normal light' : 'Switch to night light'}
                                aria-pressed={isNightLight}
                            >
                                <span className="sr-only">{isNightLight ? 'Night Light is on' : 'Light mode is on'}</span>
                                <span
                                    className={`absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-300 ease-out ${
                                        isNightLight ? 'translate-x-[49px] text-amber-700' : 'translate-x-0 text-[#0064b7]'
                                    }`}
                                >
                                    {isNightLight ? <Moon className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
                                </span>
                                <span className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${isNightLight ? 'text-amber-700/40' : 'text-transparent'}`}>
                                    <SunMedium className="h-3.5 w-3.5" />
                                </span>
                                <span className={`ml-auto flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${isNightLight ? 'text-transparent' : 'text-gray-400'}`}>
                                    <Moon className="h-3.5 w-3.5" />
                                </span>
                            </button>
                        </div>
                        <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500">
                            <Bell className="h-5 w-5" />
                        </button>
                        <div className="relative flex min-w-0 items-center gap-2 sm:gap-3">
                            <button
                                type="button"
                                onClick={() => setIsProfileOpen(true)}
                                className="flex min-w-0 items-center gap-2 rounded-full bg-[#f5f7fa] p-1 pr-2 transition-colors hover:bg-gray-100 sm:pr-3"
                                title="Edit profile"
                            >
                                <div
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                    style={{ backgroundColor: avatarColor }}
                                >
                                    {isProfileLoading ? <User className="h-4 w-4" /> : avatarInitials.toUpperCase()}
                                </div>
                                <span className="hidden max-w-[120px] truncate text-sm font-medium capitalize text-gray-700 sm:inline">{displayName}</span>
                            </button>
                            <button
                                onClick={handleLogoutClick}
                                className="hidden items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 sm:flex"
                            >
                                <LogOut className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">Logout</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className={`min-w-0 flex-1 ${isLiveChat ? 'overflow-hidden p-0' : isFlowBuilder ? 'overflow-y-auto p-0' : 'overflow-y-auto p-3 sm:p-5 lg:p-6'}`}>
                    <Outlet />
                </main>

                {/* Logout Confirmation Modal */}
                <Modal
                    isOpen={isProfileOpen}
                    onClose={() => !isSavingProfile && setIsProfileOpen(false)}
                    title="My Profile"
                    maxWidth="max-w-lg"
                >
                    <form onSubmit={handleSaveProfile} className="space-y-5">
                        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <div
                                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white shadow-sm"
                                style={{ backgroundColor: profileDraft.avatar_color }}
                            >
                                {String(profileDraft.name || displayName || 'U').trim().charAt(0).toUpperCase() || 'U'}
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-gray-900">{profileDraft.name || displayName}</div>
                                <div className="truncate text-xs text-gray-500">{userEmail}</div>
                            </div>
                        </div>

                        {profileError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {profileError}
                            </div>
                        )}

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-gray-700">Display name</span>
                            <input
                                value={profileDraft.name}
                                onChange={(e) => setProfileDraft(prev => ({ ...prev, name: e.target.value }))}
                                maxLength={80}
                                className="h-11 w-full rounded-lg border-gray-300 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                                placeholder="Your name"
                            />
                        </label>

                        <div>
                            <div className="mb-2 text-sm font-medium text-gray-700">Avatar color</div>
                            <div className="flex flex-wrap gap-2">
                                {avatarColors.map(color => (
                                    <button
                                        key={color}
                                        type="button"
                                        onClick={() => setProfileDraft(prev => ({ ...prev, avatar_color: color }))}
                                        className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-105 ${profileDraft.avatar_color === color ? 'border-gray-900' : 'border-white ring-1 ring-gray-200'}`}
                                        style={{ backgroundColor: color }}
                                        aria-label={`Use avatar color ${color}`}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                                <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                                    <Mail className="h-3.5 w-3.5" />
                                    Email
                                </div>
                                <div className="truncate text-sm text-gray-700">{userEmail || 'Not available'}</div>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                                <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                                    <Shield className="h-3.5 w-3.5" />
                                    Role
                                </div>
                                <div className="text-sm text-gray-700">{roleLabel}</div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsProfileOpen(false)}
                                disabled={isSavingProfile}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSavingProfile}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save profile
                            </button>
                        </div>
                    </form>
                </Modal>

                <Modal
                    isOpen={isLogoutConfirmOpen}
                    onClose={handleCancelLogout}
                    title="Sign out options"
                    maxWidth="max-w-lg"
                >
                    <div className="space-y-5">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <div className="flex gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 ring-1 ring-amber-200">
                                    <AlertCircle className="h-5 w-5" />
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-gray-950">Choose how you want to leave this workspace</p>
                                    <p className="mt-1 text-sm leading-6 text-gray-600">
                                        You can keep this session active for GetAiPilot, or fully sign out and return to the login page.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-3">
                            <button
                                onClick={handleContinueToGetAiPilot}
                                disabled={isLoggingOut}
                                className="group flex w-full items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-left transition-colors hover:bg-emerald-100 disabled:opacity-50"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 ring-1 ring-emerald-200">
                                    <ExternalLink className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-emerald-900">Keep me signed in</span>
                                    <span className="mt-1 block text-sm leading-5 text-emerald-800/80">
                                        Go to GetAiPilot without ending your current workspace session.
                                    </span>
                                </span>
                                <span className="mt-2 text-emerald-700 transition-transform group-hover:translate-x-0.5">
                                    <ExternalLink className="h-4 w-4" />
                                </span>
                            </button>

                            <button
                                onClick={handleConfirmLogout}
                                disabled={isLoggingOut}
                                className="group flex w-full items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                            >
                                {isLoggingOut ? (
                                    <>
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 ring-1 ring-red-100">
                                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-gray-950">Signing out...</span>
                                            <span className="mt-1 block text-sm leading-5 text-gray-500">Please wait while we close your session.</span>
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 ring-1 ring-red-100">
                                            <LogOut className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-gray-950">Sign out and go to login</span>
                                            <span className="mt-1 block text-sm leading-5 text-gray-500">
                                                End this session on this browser and return to the login screen.
                                            </span>
                                        </span>
                                        <span className="mt-2 text-gray-400 transition-colors group-hover:text-red-600">
                                            <LogOut className="h-4 w-4" />
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                            <p className="text-xs text-gray-500">Nothing changes until you choose an option.</p>
                            <button
                                onClick={handleCancelLogout}
                                disabled={isLoggingOut}
                                className="inline-flex h-10 items-center justify-center rounded-full border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                            >
                                Stay here
                            </button>
                        </div>
                    </div>
                </Modal>
            </div>
        </div>
    )
}
