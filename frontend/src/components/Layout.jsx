import { Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import Sidebar from './Sidebar'
import Modal from './Modal'
import { Bell, User, LogOut, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
    const { user, userRole, loading, isProfileLoading, signOut } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)

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

    const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'

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
                            <div className="flex items-center gap-2 rounded-full bg-gray-100 p-1 pr-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shrink-0">
                                    <User className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate capitalize">{displayName}</span>
                            </div>
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
