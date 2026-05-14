import {
    LayoutDashboard,
    MessageSquare,
    Users,
    Send,
    Workflow,
    Settings,
    HelpCircle,
    MessageCircle,
    FileText,
    Bot
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Connect Account', href: '/whatsapp-connect', icon: Settings },
    { name: 'Shared Inbox', href: '/live-chat', icon: MessageSquare },
    { name: 'Contacts', href: '/contacts', icon: Users },
    { name: 'Bot Agents', href: '/bot-agents', icon: Bot },
    { name: 'Flow Builder', href: '/flow-builder', icon: Workflow },
    { name: 'Templates', href: '/templates', icon: FileText },
    { name: 'Broadcasting', href: '/broadcast', icon: Send },
    { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
    const location = useLocation()
    const { userRole, loginType } = useAuth()
    console.log("Sidebar User Role:", userRole, "Login Type:", loginType)

    const isOwner = userRole === 'owner'

    // Restrict access for agents and admins
    const filteredNavigation = navigation.filter(item => {
        if (!isOwner) {
            // Agents and Admins only see Shared Inbox (Live Chat section)
            return ['Shared Inbox'].includes(item.name)
        }
        return true
    })

    return (
        <div className="flex h-full w-64 flex-col bg-white border-r border-gray-200">
            <div className="h-16 flex items-center px-6 border-b border-gray-200">
                <div className="flex items-center gap-2 text-[#25D366]">
                    <MessageCircle className="h-8 w-8" />
                    <span className="text-xl font-bold">FLOWSAPP</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                {filteredNavigation.map((item) => {
                    const isActive = location.pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.name}
                            to={item.href}
                            className={clsx(
                                'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                                isActive
                                    ? 'bg-green-50 text-green-600'
                                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                            )}
                        >
                            <item.icon
                                className={clsx(
                                    'mr-3 h-5 w-5 flex-shrink-0 transition-colors',
                                    isActive ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-500'
                                )}
                                aria-hidden="true"
                            />
                            {item.name}
                        </Link>
                    )
                })}
            </div>

            <div className="p-4 border-t border-gray-200">
                <Link
                    to="/help"
                    className="group flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-50 hover:text-gray-900"
                >
                    <HelpCircle className="mr-3 h-5 w-5 text-gray-400 group-hover:text-gray-500" />
                    Help Center
                </Link>
            </div>
        </div>
    )
}
