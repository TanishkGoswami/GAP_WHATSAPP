import { useEffect, useMemo, useRef, useState } from 'react'
import { X, MessageSquare, Phone, Mail, Calendar, Tag, Edit, Clock, Send, User, Video, Search } from 'lucide-react'
import { format } from 'date-fns'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

export default function ContactProfileDrawer({
    isOpen,
    onClose,
    contact,
    onEdit,
    onContactUpdated,
    focusAliasOnOpen = false,
    botEnabled = false,
    onToggleBot = null,
}) {
    const [activeTab, setActiveTab] = useState('overview') // overview, chat, notes
    const [customName, setCustomName] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    
    // Status state
    const [flowSession, setFlowSession] = useState(null);

    const aliasInputRef = useRef(null)

    const normalizeIndianPhoneKey = (value) => {
        const raw = String(value || '')
        const left = raw.includes('@') ? raw.split('@')[0] : raw
        const digits = left.replace(/[^0-9]/g, '')
        if (digits.length === 10) return `91${digits}`
        if (digits.length === 12 && digits.startsWith('91')) return digits
        return null
    }

    const formatPhoneForDisplay = (value) => {
        const raw = String(value || '')
        if (!raw) return ''
        const [left, right] = raw.includes('@') ? raw.split('@') : [raw, '']

        // Never render internal identifiers (e.g. @lid, @g.us) as a phone number.
        if (right && right !== 's.whatsapp.net') return ''

        const digits = String(left).replace(/[^0-9]/g, '')
        if (!digits) return ''

        // Indian numbers: 10 digits (local) or 12 digits starting with 91
        if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
        if (digits.length === 12 && digits.startsWith('91')) {
            const local = digits.slice(2)
            return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
        }

        // Other international numbers
        if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
        return ''
    }

    const displayName = useMemo(() => {
        const custom = String(contact?.custom_name || '').trim()
        if (custom) return custom
        const raw = String(contact?.name || '').trim()
        if (raw && !raw.includes('@') && !/^\d+$/.test(raw)) return raw
        const phone = contact?.phone || contact?.wa_id || ''
        return formatPhoneForDisplay(phone) || 'Unknown'
    }, [contact])

    const avatarText = useMemo(() => {
        const safe = String(displayName || '').trim()
        if (!safe) return '?'
        const parts = safe.split(/\s+/).filter(Boolean)
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
        return safe.slice(0, 2).toUpperCase()
    }, [displayName])

    const phoneDisplay = useMemo(() => {
        const raw = contact?.phone || contact?.wa_id || ''
        return formatPhoneForDisplay(raw)
    }, [contact])

    const profilePhotoUrl = contact?.profile_photo_url || contact?.profilePhotoUrl || contact?.photo_url || ''

    useEffect(() => {
        setCustomName(String(contact?.custom_name || ''))
        setSaveError('')
        setIsSaving(false)
        
        // Fetch active flow sessions
        if (contact?.id) {
            fetch(`${API_BASE}/flow-sessions/${contact.id}`)
                .then(res => res.json())
                .then(data => setFlowSession(data))
                .catch(err => console.error('Error fetching flow session', err));
        } else {
            setFlowSession(null);
        }
    }, [contact?.id])

    const cancelFlow = async () => {
        if (!flowSession?.id) return;
        try {
            await fetch(`${API_BASE}/flow-sessions/${flowSession.id}`, { method: 'DELETE' });
            setFlowSession(null);
        } catch (e) {
            console.error('Failed to cancel flow', e);
        }
    }

    useEffect(() => {
        if (!isOpen) return
        if (!focusAliasOnOpen) return
        setActiveTab('overview')
        // Wait for the drawer + input to render
        const t = setTimeout(() => {
            aliasInputRef.current?.focus?.()
            aliasInputRef.current?.select?.()
        }, 50)
        return () => clearTimeout(t)
    }, [isOpen, focusAliasOnOpen])

    const saveCustomName = async () => {
        const id = contact?.id
        if (!id) {
            setSaveError('Contact is not synced yet (missing id).')
            return
        }
        setIsSaving(true)
        setSaveError('')
        try {
            const res = await fetch(`${API_BASE}/contacts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ custom_name: customName }),
            })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(body || `Failed to save (HTTP ${res.status})`)
            }
            const updated = await res.json().catch(() => null)
            if (updated && typeof onContactUpdated === 'function') onContactUpdated(updated)
        } catch (e) {
            setSaveError(e?.message || 'Failed to save')
        } finally {
            setIsSaving(false)
        }
    }

    if (!isOpen || !contact) return null

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
                <div className="w-screen max-w-md transform transition-all ease-in-out duration-500 sm:duration-700 bg-white shadow-2xl flex flex-col h-full">

                    {/* Header */}
                    <div className="bg-white px-5 pb-5 pt-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition-colors hover:border-green-500 hover:bg-green-50 hover:text-gray-900"
                                    title="Close"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                                <h2 className="text-base font-semibold text-gray-900">Contact info</h2>
                            </div>
                            <button
                                onClick={() => onEdit(contact)}
                            className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                                title="Edit contact"
                            >
                                <Edit className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="mt-7 flex flex-col items-center text-center">
                            {profilePhotoUrl ? (
                                <img
                                    src={profilePhotoUrl}
                                    alt={displayName}
                                    className="h-28 w-28 rounded-full object-cover shadow-sm ring-1 ring-gray-200"
                                />
                            ) : (
                                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                                    <User className="h-14 w-14" />
                                </div>
                            )}
                            <h3 className="mt-4 text-2xl font-semibold text-gray-900">{displayName}</h3>
                            <div className="mt-1 text-sm text-gray-500 font-mono">{phoneDisplay || 'No phone'}</div>
                            <div className="mt-5 grid w-full grid-cols-3 gap-2.5">
                                {[
                                    { icon: Phone, label: 'Voice' },
                                    { icon: Video, label: 'Video' },
                                    { icon: Search, label: 'Search' },
                                ].map(action => (
                                    <button
                                        key={action.label}
                                        type="button"
                                        className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 transition-colors hover:border-green-200 hover:bg-green-50"
                                    >
                                        <action.icon className="h-5 w-5 text-green-600" />
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="border-y border-gray-200 bg-white">
                        <nav className="-mb-px flex px-6" aria-label="Tabs">
                            {['overview', 'chat', 'notes'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`
                                        w-1/3 py-4 px-1 text-center border-b-2 text-sm font-medium capitalize
                                        ${activeTab === tab
                                            ? 'border-green-500 text-green-700'
                                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}
                                    `}
                                >
                                    {tab}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 bg-gray-50">

                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                {/* Actions */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => onEdit(contact)}
                                        className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm"
                                    >
                                        <Edit className="h-4 w-4" /> Edit Details
                                    </button>
                                    <button className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-green-700 shadow-sm">
                                        <MessageSquare className="h-4 w-4" /> Send Message
                                    </button>
                                </div>

                                {/* Manual alias */}
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-4 py-5 sm:p-6 space-y-3">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-900">Chat alias</div>
                                            <p className="mt-0.5 text-xs text-gray-500">Private display name for this workspace.</p>
                                        </div>
                                        <input
                                            ref={aliasInputRef}
                                            value={customName}
                                            onChange={(e) => setCustomName(e.target.value)}
                                            placeholder="Type a name you want to see in chat"
                                            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                                        />
                                        {saveError ? (
                                            <div className="text-xs text-red-600">{saveError}</div>
                                        ) : null}
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                onClick={saveCustomName}
                                                disabled={isSaving}
                                                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                                            >
                                                {isSaving ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Details Card */}
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-4 py-5 sm:p-6 space-y-4">
                                        <div className="flex items-center gap-3 text-sm">
                                            <Mail className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-900">{contact.email || 'No email provided'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <Phone className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-900 font-mono">{phoneDisplay || 'No phone provided'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <Calendar className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-500">Joined {format(new Date(contact.created_at || Date.now()), 'MMMM d, yyyy')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Automation Status */}
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 ml-1">Automation Status</h4>
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 flex justify-between items-center text-sm border-b border-gray-100">
                                            <span className="text-gray-500 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Bot Auto Reply</span>
                                            <button 
                                                onClick={() => onToggleBot && onToggleBot(!botEnabled)}
                                                className={`font-semibold px-3 py-1 rounded-full text-xs transition-colors shadow-sm active:scale-95 ${botEnabled 
                                                    ? 'bg-green-500 text-white hover:bg-green-600' 
                                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                            >
                                                {botEnabled ? 'ENABLED' : 'DISABLED'}
                                            </button>
                                        </div>
                                        <div className="px-4 py-3 flex justify-between items-center text-sm">
                                            <span className="text-gray-500 flex items-center gap-2"><Send className="h-4 w-4" /> Active Flow</span>
                                            <div className="flex items-center gap-2">
                                                {flowSession ? (
                                                    <>
                                                        <span className="font-semibold px-2 py-0.5 rounded-md text-xs bg-green-100 text-green-700 max-w-[120px] truncate" title={flowSession?.flows?.name}>
                                                            {flowSession?.flows?.name || 'In Progress'}
                                                        </span>
                                                        <button 
                                                            onClick={cancelFlow}
                                                            className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded"
                                                            title="Stop Flow"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="font-semibold text-gray-500 text-xs">None</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Custom Attributes */}
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 ml-1">Custom Attributes</h4>
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                                        {Object.entries(contact.custom_fields || {}).length > 0 ? (
                                            Object.entries(contact.custom_fields).map(([key, value]) => (
                                                <div key={key} className="px-4 py-3 flex justify-between text-sm">
                                                    <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                                                    <span className="font-medium text-gray-900">{value}</span>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-4 text-sm text-gray-500 text-center italic">No custom attributes found</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'chat' && (
                            <div className="space-y-4">
                                <div className="text-center py-4 bg-white rounded-lg border border-gray-200">
                                    <p className="text-sm text-gray-500">Today</p>
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <div className="bg-green-600 text-white rounded-l-xl rounded-t-xl p-3 text-sm max-w-[80%] shadow-sm">
                                        Your order #1024 has been shipped! 📦
                                    </div>
                                </div>
                                <div className="flex gap-3 justify-end">
                                    <div className="text-xs text-gray-400">10:42 AM • Sent</div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="h-8 w-8 rounded-full bg-green-100 flex-shrink-0 flex items-center justify-center text-xs font-bold text-green-700">
                                        {avatarText}
                                    </div>
                                    <div className="bg-white border border-gray-200 rounded-r-xl rounded-t-xl p-3 text-sm max-w-[80%] shadow-sm text-gray-800">
                                        Thanks! Can I track it?
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="text-xs text-gray-400 ml-11">10:45 AM</div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'notes' && (
                            <div className="space-y-4">
                                <textarea
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                                    rows={4}
                                    placeholder="Add a private note about this contact..."
                                />
                                <button className="w-full bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800">
                                    Save Note
                                </button>

                                <div className="mt-6 space-y-4">
                                    <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
                                        <p className="text-sm text-gray-800">Customer prefers morning delivery. Do not call after 6 PM.</p>
                                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                            <Clock className="h-3 w-3" /> 2 days ago by Sarah
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
