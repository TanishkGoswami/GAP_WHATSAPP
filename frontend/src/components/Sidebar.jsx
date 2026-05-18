import { useEffect, useMemo, useState } from 'react'
import {
    Blocks,
    ChevronsUpDown,
    Briefcase,
    FileText,
    GitFork,
    Grid2X2,
    HelpCircle,
    LogOut,
    Megaphone,
    Plus,
    Settings,
    MessageSquareText,
    Smartphone,
    UserCircle,
    Users,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { useAuth } from '../context/AuthContext'

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Grid2X2 },
    { name: 'Accounts', href: '/whatsapp-connect', icon: Smartphone },
    { name: 'Chats', href: '/live-chat', icon: MessageSquareText, badge: 'LIVE' },
    { name: 'Contacts', href: '/contacts', icon: Users },
    { name: 'AI Agents', href: '/bot-agents', icon: Briefcase },
    { name: 'Flows', href: '/flow-builder', icon: GitFork },
    { name: 'Templates', href: '/templates', icon: FileText },
    { name: 'Broadcasts', href: '/broadcast', icon: Megaphone },
]

const SELECTED_WA_ACCOUNT_KEY = 'selected_wa_account_id'
const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`
const EXPANDED_WIDTH = 'w-[240px]'
const COLLAPSED_WIDTH = 'w-12'

export default function Sidebar({ onRequestLogout }) {
    const location = useLocation()
    const navigate = useNavigate()
    const { userRole, memberProfile, user, signOut, apiCall } = useAuth()
    const [isHovered, setIsHovered] = useState(false)
    const [isOrgMenuOpen, setIsOrgMenuOpen] = useState(false)
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
    const [waAccounts, setWaAccounts] = useState([])
    const [selectedWaAccount, setSelectedWaAccount] = useState(() => localStorage.getItem(SELECTED_WA_ACCOUNT_KEY) || 'All')

    const isOwner = userRole === 'owner'
    const isLiveChat = location.pathname.startsWith('/live-chat')
    const isCollapsed = isLiveChat && !isHovered && !isOrgMenuOpen && !isAccountMenuOpen
    const isExpanded = !isCollapsed
    const displayName = memberProfile?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account'
    const userEmail = memberProfile?.email || user?.email || ''
    const initials = String(displayName || 'A')
        .trim()
        .split(/\s+/)
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'A'

    const filteredNavigation = navigation.filter(item => {
        if (!isOwner) return item.name === 'Chats'
        return true
    })

    const selectedAccountLabel = useMemo(() => {
        if (selectedWaAccount === 'All') return 'GAP FlowPilot'
        const account = waAccounts.find(item => String(getAccountSwitchKey(item)) === String(selectedWaAccount))
        return account?.name || account?.display_phone_number || account?.phone_number_id || 'Selected account'
    }, [selectedWaAccount, waAccounts])

    useEffect(() => {
        let cancelled = false
        apiCall(`${API_BASE}/whatsapp/accounts`)
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                if (!cancelled) setWaAccounts(Array.isArray(data) ? data : [])
            })
            .catch(() => {
                if (!cancelled) setWaAccounts([])
            })
        return () => { cancelled = true }
    }, [apiCall])

    const isActive = (href) => location.pathname.startsWith(href)

    const handleSignOut = async () => {
        if (onRequestLogout) {
            onRequestLogout()
            return
        }
        await signOut()
        navigate('/login')
    }

    const closeMenus = () => {
        setIsOrgMenuOpen(false)
        setIsAccountMenuOpen(false)
    }

    const selectWaAccount = (accountId) => {
        const next = accountId || 'All'
        setSelectedWaAccount(next)
        localStorage.setItem(SELECTED_WA_ACCOUNT_KEY, next)
        window.dispatchEvent(new CustomEvent('selected-wa-account-change', { detail: { accountId: next } }))
        setIsOrgMenuOpen(false)
    }

    return (
        <div className={clsx('relative h-full shrink-0 transition-[width] duration-200 ease-out', isLiveChat ? COLLAPSED_WIDTH : EXPANDED_WIDTH)}>
            <aside
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => {
                    setIsHovered(false)
                    if (isLiveChat) closeMenus()
                }}
                className={clsx(
                    'absolute inset-y-0 left-0 z-40 flex flex-col border-r border-gray-200 bg-white transition-[width] duration-200 ease-out',
                    isCollapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH
                )}
            >
                <div className="relative flex h-14 shrink-0 items-center border-b border-gray-100 px-2">
                    <button
                        type="button"
                        onClick={() => {
                            setIsHovered(true)
                            setIsOrgMenuOpen(prev => !prev)
                        }}
                        className={clsx(
                            'flex h-9 min-w-0 items-center rounded-lg text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100',
                            isCollapsed ? 'w-8 justify-center' : 'w-full gap-2 px-2'
                        )}
                        title={selectedAccountLabel}
                    >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white ring-1 ring-gray-200">
                            <img src="/logo.png" alt="GAP FlowPilot" className="h-[17px] w-[17px] object-contain" />
                        </span>
                        <span className={labelTransition(isExpanded, 'flex min-w-0 flex-1 items-center gap-2')}>
                            <span className="truncate font-medium text-gray-700">{selectedAccountLabel}</span>
                            <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" />
                        </span>
                    </button>

                    {isOrgMenuOpen && !isCollapsed ? (
                        <div className="absolute left-2 top-12 z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-900/10">
                            <button
                                type="button"
                                onClick={() => selectWaAccount('All')}
                                className={clsx(
                                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-50',
                                    selectedWaAccount === 'All' ? 'bg-gray-100 font-semibold text-gray-950' : 'text-gray-700'
                                )}
                            >
                                <Blocks className="h-4 w-4 text-gray-500" />
                                All WhatsApp accounts
                            </button>
                            {waAccounts.map(account => (
                                <button
                                    key={account.id}
                                    type="button"
                                    onClick={() => selectWaAccount(getAccountSwitchKey(account))}
                                    className={clsx(
                                        'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-50',
                                        String(selectedWaAccount) === String(getAccountSwitchKey(account)) ? 'bg-gray-100 font-semibold text-gray-950' : 'text-gray-700'
                                    )}
                                >
                                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                                    <span className="min-w-0">
                                        <span className="block truncate">{account.name || account.display_phone_number || 'WhatsApp account'}</span>
                                        <span className="block truncate text-xs font-normal text-gray-500">{account.display_phone_number || account.phone_number_id || ''}</span>
                                    </span>
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsOrgMenuOpen(false)
                                    navigate('/whatsapp-connect')
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                            >
                                <Plus className="h-4 w-4 text-gray-500" />
                                Connect another account
                            </button>
                        </div>
                    ) : null}
                </div>

                <nav className="flex-1 overflow-y-auto px-2 py-3">
                    <div className="space-y-1">
                        {filteredNavigation.slice(0, 3).map(item => (
                            <NavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} />
                        ))}
                    </div>

                    {isOwner ? (
                        <>
                            <div className="my-2 h-px bg-gray-100" />
                            <div className="space-y-1">
                                {filteredNavigation.slice(3, 6).map(item => (
                                    <NavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} />
                                ))}
                            </div>
                            <div className="my-2 h-px bg-gray-100" />
                            <div className="space-y-1">
                                {filteredNavigation.slice(6).map(item => (
                                    <NavItem key={item.name} item={item} active={isActive(item.href)} collapsed={isCollapsed} />
                                ))}
                            </div>
                        </>
                    ) : null}
                </nav>

                <div className="border-t border-gray-100 p-2">
                    <NavItem
                        item={{ name: 'Settings', href: '/settings', icon: Settings }}
                        active={isActive('/settings')}
                        collapsed={isCollapsed}
                    />
                    <NavItem
                        item={{ name: 'Help Center', href: '/help', icon: HelpCircle }}
                        active={isActive('/help')}
                        collapsed={isCollapsed}
                    />

                    <div className="relative mt-1">
                        <button
                            type="button"
                            onClick={() => {
                                setIsHovered(true)
                                setIsAccountMenuOpen(prev => !prev)
                            }}
                            className={clsx(
                                'flex h-9 w-full items-center rounded-lg text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100',
                                isCollapsed ? 'justify-center' : 'gap-2 px-2'
                            )}
                            title="Account"
                        >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-semibold text-gray-700 ring-1 ring-gray-200">
                                {initials[0]}
                            </span>
                            <span className={labelTransition(isExpanded, 'flex min-w-0 flex-1 items-center gap-2')}>
                                <span className="truncate">Account</span>
                                <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" />
                            </span>
                        </button>

                        {isAccountMenuOpen && !isCollapsed ? (
                            <div className="absolute bottom-11 left-0 z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg shadow-gray-900/10">
                                <div className="flex items-center gap-2 px-2.5 py-2">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 text-xs font-semibold text-gray-800 ring-1 ring-gray-200">
                                        {initials}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-gray-950">{displayName}</div>
                                        <div className="truncate text-xs text-gray-500">{userEmail}</div>
                                    </div>
                                </div>
                                <div className="my-1 h-px bg-gray-100" />
                                <MenuLink to="/settings" icon={UserCircle} label="Profile" />
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                >
                                    <LogOut className="h-4 w-4 text-gray-500" />
                                    Sign out
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </aside>
        </div>
    )
}

function NavItem({ item, active, collapsed }) {
    const Icon = item.icon
    const isExpanded = !collapsed
    return (
        <Link
            to={item.href}
            title={collapsed ? item.name : undefined}
            className={clsx(
                'group flex h-9 items-center rounded-md text-[14px] font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'gap-2 px-2',
                active ? 'bg-gray-100 text-gray-950' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
            )}
        >
            <Icon className={clsx('h-4 w-4 shrink-0 stroke-[1.9]', active ? 'text-gray-950' : 'text-gray-500 group-hover:text-gray-700')} />
            <span className={labelTransition(isExpanded, 'flex min-w-0 flex-1 items-center')}>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.badge ? (
                    <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-blue-600">
                        {item.badge}
                    </span>
                ) : null}
            </span>
        </Link>
    )
}

function MenuLink({ to, icon: Icon, label }) {
    return (
        <Link to={to} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-100">
            <Icon className="h-4 w-4 text-gray-500" />
            {label}
        </Link>
    )
}

function getAccountSwitchKey(account) {
    return account?.display_phone_number || account?.phone_number_id || account?.id || 'All'
}

function labelTransition(show, extra = '') {
    return clsx(
        'overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200 ease-out',
        show ? 'max-w-[180px] translate-x-0 opacity-100' : 'max-w-0 -translate-x-1.5 opacity-0',
        extra
    )
}
