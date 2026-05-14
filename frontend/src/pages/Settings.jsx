import { useState, useEffect, useRef } from 'react'
import { Save, Upload, FileText, Trash2, Bot, Database, Globe, Users, ShoppingBag, Key, Webhook, Copy, Check, User, Mail, UserPlus, X, Trash, Image, RefreshCw, AlertCircle, Loader2, Building2, PhoneCall, Link as LinkIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default function Settings() {
    const { session, userRole, loginType } = useAuth()
    const [activeTab, setActiveTab] = useState('general')
    const [documents, setDocuments] = useState([])
    const [knowledgeStats, setKnowledgeStats] = useState({ total_documents: 0, total_characters: 0 })
    const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false)
    const [isUploadingKnowledge, setIsUploadingKnowledge] = useState(false)
    const [knowledgeError, setKnowledgeError] = useState('')
    const [knowledgeSuccess, setKnowledgeSuccess] = useState('')
    const [isDraggingKnowledge, setIsDraggingKnowledge] = useState(false)
    const knowledgeFileInputRef = useRef(null)

    const [members, setMembers] = useState([])
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'agent' })
    const [isInviting, setIsInviting] = useState(false)
    const [isLoadingMembers, setIsLoadingMembers] = useState(false)
    const [accounts, setAccounts] = useState([])
    const [selectedAccountId, setSelectedAccountId] = useState('')
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)
    const [isLoadingProfile, setIsLoadingProfile] = useState(false)
    const [isSavingProfile, setIsSavingProfile] = useState(false)
    const [profileError, setProfileError] = useState('')
    const [profileSuccess, setProfileSuccess] = useState('')
    const [lastProfileSyncAt, setLastProfileSyncAt] = useState(null)
    const [profileImageFile, setProfileImageFile] = useState(null)
    const [profileImagePreview, setProfileImagePreview] = useState('')
    const [businessProfile, setBusinessProfile] = useState({
        local_name: '',
        about: '',
        description: '',
        email: '',
        address: '',
        websites: '',
        vertical: '',
        profile_picture_url: ''
    })

    const authHeaders = {
        Authorization: `Bearer ${session?.access_token || ''}`,
        'X-Auth-Portal': loginType || 'owner'
    }

    const formatKnowledgeDate = (value) => {
        if (!value) return 'Just now'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return 'Just now'
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    }

    const fetchKnowledgeBase = async () => {
        if (!session?.access_token) return
        setIsLoadingKnowledge(true)
        setKnowledgeError('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/settings/knowledge-base`, {
                headers: authHeaders
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to load knowledge base')
            setDocuments(Array.isArray(data.documents) ? data.documents.map(doc => ({
                ...doc,
                size: doc.size_label || 'File',
                date: formatKnowledgeDate(doc.created_at)
            })) : [])
            setKnowledgeStats({
                total_documents: data.total_documents || 0,
                total_characters: data.total_characters || 0
            })
        } catch (e) {
            console.error('Failed to load knowledge base', e)
            setKnowledgeError(e?.message || 'Failed to load knowledge base.')
        } finally {
            setIsLoadingKnowledge(false)
        }
    }

    const uploadKnowledgeFiles = async (files) => {
        const list = Array.from(files || [])
        if (!list.length || !session?.access_token) return
        setIsUploadingKnowledge(true)
        setKnowledgeError('')
        setKnowledgeSuccess('')
        try {
            for (const file of list) {
                const form = new FormData()
                form.append('file', file)
                const res = await fetch(`${BACKEND_BASE}/api/settings/knowledge-base`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: form
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data?.error || `Failed to upload ${file.name}`)
            }
            setKnowledgeSuccess(`${list.length} document${list.length > 1 ? 's' : ''} indexed for AI replies.`)
            await fetchKnowledgeBase()
        } catch (e) {
            console.error('Failed to upload knowledge document', e)
            setKnowledgeError(e?.message || 'Failed to upload document.')
        } finally {
            setIsUploadingKnowledge(false)
            if (knowledgeFileInputRef.current) knowledgeFileInputRef.current.value = ''
        }
    }

    const handleDelete = async (id) => {
        if (!session?.access_token) return
        if (!confirm('Delete this knowledge document? AI replies will stop using it.')) return
        setKnowledgeError('')
        setKnowledgeSuccess('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/settings/knowledge-base/${id}`, {
                method: 'DELETE',
                headers: authHeaders
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to delete document')
            setDocuments(prev => prev.filter(doc => doc.id !== id))
            setKnowledgeSuccess('Document removed from knowledge base.')
            await fetchKnowledgeBase()
        } catch (e) {
            console.error('Failed to delete knowledge document', e)
            setKnowledgeError(e?.message || 'Failed to delete document.')
        }
    }

    const fetchAccounts = async () => {
        if (!session?.access_token) return
        setIsLoadingAccounts(true)
        setProfileError('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/whatsapp/accounts`, {
                headers: authHeaders
            })
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setAccounts(Array.isArray(data) ? data : [])
            if (!selectedAccountId && data?.[0]?.id) setSelectedAccountId(data[0].id)
        } catch (e) {
            console.error('Failed to fetch WhatsApp accounts', e)
            setProfileError('Could not load WhatsApp accounts.')
        } finally {
            setIsLoadingAccounts(false)
        }
    }

    const loadBusinessProfile = async (accountId = selectedAccountId) => {
        if (!session?.access_token || !accountId) return
        setIsLoadingProfile(true)
        setProfileError('')
        setProfileSuccess('')
        try {
            const res = await fetch(`${BACKEND_BASE}/api/whatsapp/accounts/${accountId}/business-profile`, {
                headers: authHeaders
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to load profile')

            const profile = data.profile || {}
            const account = data.account || accounts.find(acc => acc.id === accountId) || {}
            setBusinessProfile({
                local_name: account.name || '',
                about: profile.about || '',
                description: profile.description || '',
                email: profile.email || '',
                address: profile.address || '',
                websites: Array.isArray(profile.websites) ? profile.websites.join('\n') : '',
                vertical: profile.vertical || '',
                profile_picture_url: profile.profile_picture_url || ''
            })
            setLastProfileSyncAt(new Date())
            setProfileImageFile(null)
            setProfileImagePreview('')
            if (data.profile_error) setProfileError(data.profile_error)
        } catch (e) {
            console.error('Failed to load business profile', e)
            setProfileError(e?.message || 'Failed to load business profile.')
        } finally {
            setIsLoadingProfile(false)
        }
    }

    const saveBusinessProfile = async (e) => {
        e.preventDefault()
        if (!selectedAccountId || !session?.access_token) return
        setIsSavingProfile(true)
        setProfileError('')
        setProfileSuccess('')
        try {
            const form = new FormData()
            Object.entries(businessProfile).forEach(([key, value]) => {
                if (key === 'profile_picture_url') return
                form.append(key, value || '')
            })
            if (profileImageFile) form.append('profile_picture', profileImageFile)

            const res = await fetch(`${BACKEND_BASE}/api/whatsapp/accounts/${selectedAccountId}/business-profile`, {
                method: 'PATCH',
                headers: authHeaders,
                body: form
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data?.error || 'Failed to save business profile')

            setProfileSuccess('WhatsApp business profile saved.')
            await fetchAccounts()
            await loadBusinessProfile(selectedAccountId)
        } catch (e) {
            console.error('Failed to save business profile', e)
            setProfileError(e?.message || 'Failed to save business profile.')
        } finally {
            setIsSavingProfile(false)
        }
    }

    const [apiKey, setApiKey] = useState('sk_live_51M...')
    const [copied, setCopied] = useState(false)

    const copyToClipboard = () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const fetchMembers = async () => {
        if (!session?.access_token) return
        setIsLoadingMembers(true)
        try {
            const res = await fetch(`${BACKEND_BASE}/api/team/members`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setMembers(data)
            }
        } catch (e) {
            console.error("Failed to fetch members", e)
        } finally {
            setIsLoadingMembers(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'team_members') {
            fetchMembers()
        }
    }, [activeTab, session])

    useEffect(() => {
        if (activeTab === 'general') {
            fetchAccounts()
        }
    }, [activeTab, session?.access_token])

    useEffect(() => {
        if (activeTab === 'knowledge_base') {
            fetchKnowledgeBase()
        }
    }, [activeTab, session?.access_token])

    useEffect(() => {
        if (activeTab === 'general' && selectedAccountId) {
            loadBusinessProfile(selectedAccountId)
        }
    }, [activeTab, selectedAccountId])

    const handleInvite = async (e) => {
        e.preventDefault()
        if (!inviteForm.email || !inviteForm.name) return
        setIsInviting(true)
        try {
            const res = await fetch(`${BACKEND_BASE}/api/team/invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify(inviteForm)
            })
            if (res.ok) {
                setIsInviteOpen(false)
                setInviteForm({ name: '', email: '', password: '', role: 'agent' })
                fetchMembers()
            } else {
                const err = await res.json()
                alert(err.error || "Invite failed")
            }
        } catch (e) {
            console.error("Invite failed", e)
        } finally {
            setIsInviting(false)
        }
    }

    const updateRole = async (memberId, role) => {
        try {
            const res = await fetch(`${BACKEND_BASE}/api/team/members/${memberId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ role })
            })
            if (res.ok) fetchMembers()
        } catch (e) {
            console.error("Update failed", e)
        }
    }

    const removeMember = async (memberId) => {
        if (!confirm('Are you sure you want to remove this member?')) return
        try {
            const res = await fetch(`${BACKEND_BASE}/api/team/members/${memberId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session.access_token}` }
            })
            if (res.ok) fetchMembers()
        } catch (e) {
            console.error("Remove failed", e)
        }
    }

    const isAdmin = userRole === 'admin' || userRole === 'owner'

    return (
        <div className="mx-auto flex w-full max-w-[1440px] gap-8 px-6">
            {/* Sidebar */}
            <div className="w-60 flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
                <nav className="space-y-1">
                    {['General', 'Knowledge Base', 'Integrations', 'Team Members', 'Developer API'].map((tab) => {
                        const id = tab.toLowerCase().replace(' ', '_')
                        if (id === 'team_members' && !isAdmin) return null
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(id)}
                                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === id
                                    ? 'bg-indigo-50 text-indigo-700'
                                    : 'text-gray-700 hover:bg-gray-50'
                                    }`}
                            >
                                {id === 'general' && <Globe className="mr-3 h-5 w-5 text-gray-400" />}
                                {id === 'knowledge_base' && <Database className="mr-3 h-5 w-5 text-gray-400" />}
                                {id === 'integrations' && <ShoppingBag className="mr-3 h-5 w-5 text-gray-400" />}
                                {id === 'team_members' && <Users className="mr-3 h-5 w-5 text-gray-400" />}
                                {id === 'developer_api' && <Bot className="mr-3 h-5 w-5 text-gray-400" />}
                                {tab}
                            </button>
                        )
                    })}
                </nav>
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 bg-white rounded-xl border border-gray-200 shadow-sm min-h-[600px] overflow-hidden">
                {activeTab === 'general' && (
                    <div className="bg-gray-50/60">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-8 py-6">
                            <div>
                                <h2 className="text-xl font-semibold text-gray-900">General</h2>
                                <p className="mt-1 text-sm text-gray-500">Manage WhatsApp Business profiles across all connected numbers.</p>
                            </div>
                            <button
                                type="button"
                                onClick={fetchAccounts}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Refresh
                            </button>
                        </div>

                        {profileError && (
                            <div className="mx-8 mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{profileError}</span>
                            </div>
                        )}

                        {profileSuccess && (
                            <div className="mx-8 mt-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                                <Check className="h-4 w-4" />
                                <span>{profileSuccess}</span>
                            </div>
                        )}

                        {isLoadingAccounts ? (
                            <div className="py-16 text-center text-sm text-gray-500">Loading WhatsApp accounts...</div>
                        ) : accounts.length === 0 ? (
                            <div className="m-8 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
                                <PhoneCall className="mx-auto h-10 w-10 text-gray-300" />
                                <h3 className="mt-3 text-sm font-semibold text-gray-900">No WhatsApp accounts connected</h3>
                                <p className="mt-1 text-sm text-gray-500">Connect an account first, then you can edit its business profile here.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-0 xl:grid-cols-[320px_1fr]">
                                <aside className="border-b border-gray-200 bg-white p-6 xl:border-b-0 xl:border-r">
                                    <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Connected accounts</div>
                                    <div className="space-y-2">
                                    {accounts.map(account => (
                                        <button
                                            key={account.id}
                                            type="button"
                                            onClick={() => setSelectedAccountId(account.id)}
                                            className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedAccountId === account.id ? 'border-green-500 bg-green-50 shadow-sm' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                                                    <PhoneCall className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold text-gray-900">{account.name || 'WhatsApp Business'}</div>
                                                    <div className="truncate text-xs text-gray-500">{account.display_phone_number || account.phone_number_id}</div>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-xs">
                                                <span className="rounded-full bg-white px-2 py-1 text-gray-600 ring-1 ring-gray-200">{account.status || 'connected'}</span>
                                                <span className="text-gray-400">ID {String(account.phone_number_id || '').slice(-5)}</span>
                                            </div>
                                        </button>
                                    ))}
                                    </div>
                                </aside>

                                <form onSubmit={saveBusinessProfile} className="min-w-0 bg-gray-50/60">
                                    <div className="border-b border-gray-200 bg-white px-8 py-5">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <h3 className="text-base font-semibold text-gray-900">Business profile</h3>
                                                <p className="mt-1 text-sm text-gray-500">These details are shown to customers on WhatsApp where Meta supports them.</p>
                                                {lastProfileSyncAt && (
                                                    <p className="mt-1 text-xs text-gray-400">
                                                        Last read from Meta at {lastProfileSyncAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => loadBusinessProfile(selectedAccountId)}
                                                    disabled={isLoadingProfile}
                                                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                                >
                                                    {isLoadingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                                    Sync from Meta
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-6 p-8">
                                        <section className="rounded-xl border border-gray-200 bg-white p-6">
                                            <div className="mb-5">
                                                <h4 className="text-sm font-semibold text-gray-900">Profile identity</h4>
                                                <p className="mt-1 text-xs text-gray-500">Photo and internal label for this connected number.</p>
                                            </div>

                                            <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[210px_1fr]">
                                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                                    <div className="mx-auto flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm">
                                                    {(profileImagePreview || businessProfile.profile_picture_url) ? (
                                                        <img
                                                            src={profileImagePreview || businessProfile.profile_picture_url}
                                                            alt="Business profile"
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <Image className="h-9 w-9 text-gray-300" />
                                                    )}
                                                    </div>
                                                    <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                                                    <Upload className="h-4 w-4" />
                                                    Upload photo
                                                    <input
                                                        type="file"
                                                        accept="image/jpeg,image/png"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0] || null
                                                            setProfileImageFile(file)
                                                            setProfileImagePreview(file ? URL.createObjectURL(file) : '')
                                                        }}
                                                    />
                                                    </label>
                                                    <p className="mt-2 text-center text-[11px] leading-4 text-gray-400">Use a clear square JPG or PNG. Meta may review business branding.</p>
                                                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
                                                        <div className="flex gap-2">
                                                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                                                            <p>WhatsApp Cloud API supports profile photo here, but does not expose a cover/banner image field.</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                                                    <label className="block">
                                                    <span className="text-xs font-medium text-gray-700">Account label in this app</span>
                                                    <input
                                                        value={businessProfile.local_name}
                                                        onChange={(e) => setBusinessProfile(p => ({ ...p, local_name: e.target.value }))}
                                                        className="mt-1 h-10 w-full rounded-lg border-gray-300 text-sm focus:border-green-500 focus:ring-green-500"
                                                        placeholder="Support number"
                                                    />
                                                    </label>
                                                    <label className="block">
                                                    <span className="text-xs font-medium text-gray-700">Business category</span>
                                                    <select
                                                        value={businessProfile.vertical}
                                                        onChange={(e) => setBusinessProfile(p => ({ ...p, vertical: e.target.value }))}
                                                        className="mt-1 h-10 w-full rounded-lg border-gray-300 text-sm focus:border-green-500 focus:ring-green-500"
                                                    >
                                                        <option value="">Select category</option>
                                                        {['AUTO', 'BEAUTY', 'APPAREL', 'EDU', 'ENTERTAIN', 'EVENT_PLAN', 'FINANCE', 'GROCERY', 'GOVT', 'HOTEL', 'HEALTH', 'NONPROFIT', 'PROF_SERVICES', 'RETAIL', 'TRAVEL', 'RESTAURANT', 'OTHER'].map(value => (
                                                            <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                                                        ))}
                                                    </select>
                                                    </label>
                                                    <label className="block lg:col-span-2">
                                                    <span className="text-xs font-medium text-gray-700">About / bio</span>
                                                    <span className="ml-2 text-[11px] text-gray-400">Usually the first line people notice in WhatsApp profile.</span>
                                                    <input
                                                        value={businessProfile.about}
                                                        onChange={(e) => setBusinessProfile(p => ({ ...p, about: e.target.value }))}
                                                        maxLength={139}
                                                        className="mt-1 h-10 w-full rounded-lg border-gray-300 text-sm focus:border-green-500 focus:ring-green-500"
                                                        placeholder="Short WhatsApp bio"
                                                    />
                                                        <div className="mt-1 text-right text-[11px] text-gray-400">{businessProfile.about.length}/139</div>
                                                    </label>
                                                </div>
                                            </div>
                                        </section>

                                        <section className="rounded-xl border border-gray-200 bg-white p-6">
                                            <div className="mb-5">
                                                <h4 className="text-sm font-semibold text-gray-900">Business details</h4>
                                                <p className="mt-1 text-xs text-gray-500">Customer-facing description and ways to contact the business.</p>
                                            </div>

                                            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                                                <label className="block 2xl:col-span-2">
                                                    <span className="text-xs font-medium text-gray-700">Business description</span>
                                                    <span className="ml-2 text-[11px] text-gray-400">Can take time to appear in customer WhatsApp apps because WhatsApp clients cache profiles.</span>
                                                    <textarea
                                                        value={businessProfile.description}
                                                        onChange={(e) => setBusinessProfile(p => ({ ...p, description: e.target.value }))}
                                                        rows={5}
                                                        className="mt-1 w-full resize-y rounded-lg border-gray-300 text-sm leading-5 focus:border-green-500 focus:ring-green-500"
                                                        placeholder="Tell customers what this account is for"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <span className="mb-1.5 block text-xs font-medium text-gray-700">Email</span>
                                                    <div className="relative">
                                                        <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                        <input
                                                            value={businessProfile.email}
                                                            onChange={(e) => setBusinessProfile(p => ({ ...p, email: e.target.value }))}
                                                            className="h-11 w-full rounded-lg border-gray-300 bg-white pl-10 pr-3 text-sm leading-5 text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:ring-green-500"
                                                            placeholder="support@example.com"
                                                        />
                                                    </div>
                                                </label>
                                                <label className="block">
                                                    <span className="mb-1.5 block text-xs font-medium text-gray-700">Websites</span>
                                                    <div className="relative">
                                                        <LinkIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                        <textarea
                                                            value={businessProfile.websites}
                                                            onChange={(e) => setBusinessProfile(p => ({ ...p, websites: e.target.value }))}
                                                            rows={2}
                                                            className="min-h-[44px] w-full resize-y rounded-lg border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm leading-5 text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:ring-green-500"
                                                            placeholder={'https://example.com\nhttps://shop.example.com'}
                                                        />
                                                    </div>
                                                </label>
                                                <label className="block">
                                                    <span className="mb-1.5 block text-xs font-medium text-gray-700">Address</span>
                                                    <div className="relative">
                                                        <Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                                        <textarea
                                                            value={businessProfile.address}
                                                            onChange={(e) => setBusinessProfile(p => ({ ...p, address: e.target.value }))}
                                                            rows={2}
                                                            className="min-h-[44px] w-full resize-y rounded-lg border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm leading-5 text-gray-900 placeholder:text-gray-400 focus:border-green-500 focus:ring-green-500"
                                                            placeholder="Business address"
                                                        />
                                                    </div>
                                                </label>
                                            </div>
                                        </section>

                                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                                            <div className="font-medium">Meta and WhatsApp app visibility</div>
                                            <p className="mt-1 text-blue-800/80">After saving, this page reads the profile back from Meta. If Meta shows the new value here but WhatsApp still shows an old one, the customer WhatsApp app is using cached profile data. The short About/bio is usually more visible than the longer business description.</p>
                                        </div>
                                    </div>

                                    <div className="sticky bottom-0 flex items-center justify-between border-t border-gray-200 bg-white/95 px-8 py-4 backdrop-blur">
                                        <div className="text-xs text-gray-500">
                                            Changes apply to the selected WhatsApp account only.
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isSavingProfile || isLoadingProfile}
                                            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-60"
                                        >
                                            {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            Save changes
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'knowledge_base' && (
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-8 py-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Knowledge Base</h2>
                                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                    Upload company documents once and active AI agents will use them while replying in WhatsApp chats.
                                </p>
                            </div>
                            <button
                                onClick={fetchKnowledgeBase}
                                disabled={isLoadingKnowledge || isUploadingKnowledge}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60"
                            >
                                {isLoadingKnowledge ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Refresh
                            </button>
                        </div>

                        <div className="space-y-6 p-8">
                            {(knowledgeError || knowledgeSuccess) && (
                                <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${knowledgeError ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
                                    {knowledgeError ? <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                                    <span>{knowledgeError || knowledgeSuccess}</span>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Documents</div>
                                    <div className="mt-2 text-2xl font-semibold text-gray-900">{knowledgeStats.total_documents || documents.length}</div>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Indexed text</div>
                                    <div className="mt-2 text-2xl font-semibold text-gray-900">{Number(knowledgeStats.total_characters || 0).toLocaleString()}</div>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-green-50 p-4">
                                    <div className="text-xs font-medium uppercase tracking-wide text-green-700">AI usage</div>
                                    <div className="mt-2 text-sm font-medium text-green-900">Automatically available to active bot agents</div>
                                </div>
                            </div>

                            <div
                                onClick={() => knowledgeFileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault()
                                    setIsDraggingKnowledge(true)
                                }}
                                onDragLeave={() => setIsDraggingKnowledge(false)}
                                onDrop={(e) => {
                                    e.preventDefault()
                                    setIsDraggingKnowledge(false)
                                    uploadKnowledgeFiles(e.dataTransfer.files)
                                }}
                                className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${isDraggingKnowledge ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-green-300 hover:bg-green-50/40'}`}
                            >
                                <input
                                    ref={knowledgeFileInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json"
                                    className="hidden"
                                    onChange={(e) => uploadKnowledgeFiles(e.target.files)}
                                />
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200">
                                    {isUploadingKnowledge ? <Loader2 className="h-6 w-6 animate-spin text-green-600" /> : <Upload className="h-6 w-6" />}
                                </div>
                                <h3 className="text-sm font-semibold text-gray-900">{isUploadingKnowledge ? 'Indexing document...' : 'Upload knowledge documents'}</h3>
                                <p className="mt-1 text-xs text-gray-500">PDF, DOCX, TXT, MD, CSV, JSON up to 10MB each</p>
                                <p className="mt-3 text-xs text-gray-400">Readable text is extracted and added to AI context for this workspace.</p>
                            </div>

                            <div className="rounded-xl border border-gray-200">
                                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900">Uploaded documents</h3>
                                        <p className="mt-0.5 text-xs text-gray-500">{documents.length} indexed source{documents.length === 1 ? '' : 's'}</p>
                                    </div>
                                </div>
                                <div className="divide-y divide-gray-100">
                            {isLoadingKnowledge ? (
                                <div className="px-5 py-10 text-center text-sm text-gray-500">Loading knowledge base...</div>
                            ) : documents.length === 0 ? (
                                <div className="px-5 py-10 text-center text-sm text-gray-500">No knowledge documents yet.</div>
                            ) : documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 bg-white rounded-lg border border-gray-200 flex items-center justify-center text-gray-500">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-medium text-gray-900">{doc.name}</h4>
                                            <p className="text-xs text-gray-500">{doc.size} • {doc.date}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${doc.status === 'INDEXED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {doc.status}
                                        </span>
                                        <button
                                            onClick={() => handleDelete(doc.id)}
                                            className="text-gray-400 hover:text-red-600 transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'team_members' && isAdmin && (
                    <div className="p-8">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-lg font-medium text-gray-900">Team Members</h2>
                                <p className="text-sm text-gray-500">Manage your agents and their roles.</p>
                            </div>
                            <button
                                onClick={() => setIsInviteOpen(true)}
                                className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                            >
                                <UserPlus className="h-4 w-4" />
                                Invite Member
                            </button>
                        </div>

                        {isLoadingMembers ? (
                            <div className="py-12 text-center text-gray-500">Loading members...</div>
                        ) : (
                            <div className="overflow-hidden border border-gray-200 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {members.map((member) => (
                                            <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
                                                            style={{ backgroundColor: member.avatar_color || '#6366f1' }}>
                                                            {member.name?.charAt(0)?.toUpperCase()}
                                                        </div>
                                                        <div className="ml-4">
                                                            <div className="text-sm font-medium text-gray-900">{member.name}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-500">{member.email}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <select
                                                        value={member.role}
                                                        onChange={(e) => updateRole(member.id, e.target.value)}
                                                        disabled={member.role === 'owner'}
                                                        className="text-sm border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                                                    >
                                                        <option value="owner">Owner</option>
                                                        <option value="admin">Admin</option>
                                                        <option value="agent">Agent</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${member.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                        }`}>
                                                        <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${member.is_active ? 'bg-green-400' : 'bg-red-400'}`} />
                                                        {member.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => removeMember(member.id)}
                                                        disabled={member.role === 'owner'}
                                                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                                                    >
                                                        <Trash className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Invite Modal */}
                        {isInviteOpen && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                                <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
                                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                                        <h3 className="text-lg font-bold text-gray-900">Invite New Member</h3>
                                        <button onClick={() => setIsInviteOpen(false)} className="text-gray-400 hover:text-gray-600">
                                            <X className="h-6 w-6" />
                                        </button>
                                    </div>
                                    <form onSubmit={handleInvite} className="p-6 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                            <input
                                                type="text"
                                                required
                                                value={inviteForm.name}
                                                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                                                placeholder="John Doe"
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                            <input
                                                type="email"
                                                required
                                                value={inviteForm.email}
                                                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                                                placeholder="john@example.com"
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Login Password</label>
                                            <input
                                                type="text"
                                                required
                                                value={inviteForm.password || ''}
                                                onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                                                placeholder="Set a password for the agent"
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                            <select
                                                value={inviteForm.role}
                                                onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                                                className="w-full rounded-lg border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            >
                                                <option value="admin">Admin (Can manage settings)</option>
                                                <option value="agent">Agent (Can manage chats)</option>
                                            </select>
                                        </div>
                                        <div className="pt-4">
                                            <button
                                                type="submit"
                                                disabled={isInviting}
                                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-bold transition-all shadow-lg disabled:opacity-50"
                                            >
                                                {isInviting ? 'Sending Invite...' : 'Send Invitation'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'integrations' && (
                    <div className="p-8 space-y-8">
                        <div>
                            <h2 className="text-lg font-medium text-gray-900">E-commerce Integrations</h2>
                            <p className="text-sm text-gray-500">Connect your store to automate order notifications and abandoned cart recovery.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Shopify */}
                            <div className="border border-gray-200 rounded-xl p-6 flex flex-col justify-between hover:border-green-500 transition-colors bg-gradient-to-br from-white to-gray-50">
                                <div>
                                    <div className="h-10 w-10 bg-[#95BF47]/20 rounded-lg flex items-center justify-center mb-4 text-[#95BF47] font-bold">S</div>
                                    <h3 className="font-bold text-gray-900">Shopify</h3>
                                    <p className="text-xs text-gray-500 mt-1">Sync products, orders, and customers.</p>
                                </div>
                                <div className="mt-4">
                                    <button className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Connect Store</button>
                                </div>
                            </div>

                            {/* WooCommerce */}
                            <div className="border border-gray-200 rounded-xl p-6 flex flex-col justify-between hover:border-purple-500 transition-colors bg-gradient-to-br from-white to-gray-50">
                                <div>
                                    <div className="h-10 w-10 bg-[#96588a]/20 rounded-lg flex items-center justify-center mb-4 text-[#96588a] font-bold">W</div>
                                    <h3 className="font-bold text-gray-900">WooCommerce</h3>
                                    <p className="text-xs text-gray-500 mt-1">Open source e-commerce plugin for WordPress.</p>
                                </div>
                                <div className="mt-4">
                                    <button className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Connect Plugin</button>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-6">
                            <h3 className="text-sm font-medium text-gray-900 mb-4">Automation Triggers</h3>
                            <div className="space-y-3">
                                {['Abandoned Cart Recovery', 'Order Confirmation', 'Shipping Update', 'COD Confirmation'].map(trigger => (
                                    <div key={trigger} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <span className="text-sm text-gray-700">{trigger}</span>
                                        <div className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 bg-gray-200">
                                            <span className="translate-x-0 pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'developer_api' && (
                    <div className="p-8 space-y-8">
                        <div>
                            <h2 className="text-lg font-medium text-gray-900">Developer API</h2>
                            <p className="text-sm text-gray-500">Manage your API keys and webhooks for custom integrations.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Live API Key</label>
                            <div className="flex gap-2">
                                <input
                                    type="password"
                                    readOnly
                                    value={apiKey}
                                    className="flex-1 rounded-lg border-gray-300 bg-gray-50 font-mono text-sm"
                                />
                                <button
                                    onClick={copyToClipboard}
                                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
                                >
                                    {copied ? <Check className="h-5 w-5 text-green-600" /> : <Copy className="h-5 w-5" />}
                                </button>
                                <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600">
                                    <Key className="h-5 w-5" />
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">Never share your API key. Use it to authenticate requests to our API.</p>
                        </div>

                        <div className="border-t border-gray-100 pt-6">
                            <h3 className="text-sm font-medium text-gray-900 mb-4">Webhooks</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
                                    <input
                                        type="text"
                                        placeholder="https://your-server.com/webhook"
                                        className="w-full rounded-lg border-gray-300 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Verified Events</label>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        {['message.received', 'message.sent', 'status.update'].map(evt => (
                                            <span key={evt} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">{evt}</span>
                                        ))}
                                    </div>
                                </div>
                                <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
                                    <Webhook className="h-4 w-4" /> Save Webhook Settings
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab !== 'general' && activeTab !== 'knowledge_base' && activeTab !== 'integrations' && activeTab !== 'developer_api' && activeTab !== 'team_members' && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        Content for {activeTab.replace('_', ' ')} coming soon...
                    </div>
                )}
            </div>
        </div>
    )
}
