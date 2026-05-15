import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import Sidebar from './Sidebar'
import Modal from './Modal'
import { Bell, User, LogOut, AlertCircle, Save, Loader2, Mail, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

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

    if (loading) return null // wait only for the initial auth check, never block on profile re-fetch
    if (!user) return <Navigate to="/login" replace />

    const isOwner = userRole === 'owner'
    const isLiveChat = location.pathname === '/live-chat'
    
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

    const handleCancelLogout = () => {
        setIsLogoutConfirmOpen(false)
    }

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
        <div className="flex h-screen bg-gray-50">
            <Sidebar />

            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Topbar */}
                <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
                    <div className="flex items-center gap-4">
                        {/* Breadcrumbs or Title could go here */}
                        {/* For now, just a placeholder or empty */}
                    </div>

                    <div className="flex items-center gap-4">
                        <button className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500">
                            <Bell className="h-5 w-5" />
                        </button>
                        <div className="relative flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setIsProfileOpen(true)}
                                className="flex items-center gap-2 rounded-full bg-gray-100 p-1 pr-3 transition-colors hover:bg-gray-200"
                                title="Edit profile"
                            >
                                <div
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                    style={{ backgroundColor: avatarColor }}
                                >
                                    {isProfileLoading ? <User className="h-4 w-4" /> : avatarInitials.toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate capitalize">{displayName}</span>
                            </button>
                            <button
                                onClick={handleLogoutClick}
                                className="flex items-center gap-2 rounded-full bg-red-50 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-100 transition-colors"
                            >
                                <LogOut className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">Logout</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className={`flex-1 ${isLiveChat ? 'overflow-hidden p-0' : 'overflow-y-auto p-6'}`}>
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
                    title="Confirm Logout"
                    maxWidth="max-w-md"
                >
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
                            <AlertCircle className="h-6 w-6 text-amber-600" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm text-gray-600 mb-3">
                                Are you sure you want to logout? You will be redirected to the login page.
                            </p>
                        </div>
                        <div className="flex w-full gap-3">
                            <button
                                onClick={handleCancelLogout}
                                disabled={isLoggingOut}
                                className="flex-1 rounded-lg border border-gray-300 py-2 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmLogout}
                                disabled={isLoggingOut}
                                className="flex-1 rounded-lg bg-red-600 py-2 px-4 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoggingOut ? (
                                    <>
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                                        Logging out...
                                    </>
                                ) : (
                                    'Logout'
                                )}
                            </button>
                        </div>
                    </div>
                </Modal>
            </div>
        </div>
    )
}
