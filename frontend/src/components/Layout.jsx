import { Outlet, Navigate, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { Bell, User, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
    const { user, loading, signOut } = useAuth()
    const navigate = useNavigate()

    if (loading) return null // wait for auth context to determine session
    if (!user) return <Navigate to="/login" replace />

    const handleLogout = async () => {
        try {
            await signOut()
            navigate('/login')
        } catch (err) {
            console.error('Logout error:', err)
            // Even if it fails on server, we should usually force a redirect or clear local state
            navigate('/login')
        }
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
                                onClick={handleLogout}
                                className="flex items-center gap-2 rounded-full bg-red-50 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-100 transition-colors"
                            >
                                <LogOut className="h-4 w-4 shrink-0" />
                                <span className="hidden sm:inline">Logout</span>
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
