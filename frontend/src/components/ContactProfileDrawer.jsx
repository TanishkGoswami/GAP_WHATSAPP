import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    X,
    MessageSquare,
    Phone,
    Mail,
    Calendar,
    Edit,
    Clock,
    Send,
    User,
    Search,
    Flame,
    Target,
    ClipboardList,
    CheckCircle2,
    BadgeInfo,
    StickyNote,
} from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

const INTERNAL_CUSTOM_FIELD_KEYS = new Set([
    'profile_photo_url',
    'profile_photo_checked_at',
    'private_notes',
    'lead_summary',
    'lead_next_step',
    'lead_topics',
    'lead_temperature',
    'lead_interest',
    'sales_note_auto',
])

const FOLLOW_UP_RE = /\b(today|tomorrow|morning|afternoon|evening|night|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s?(?:am|pm))\b/i
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const AMOUNT_RE = /(?:rs\.?|inr|\u20B9|\$)\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:rs|inr|rupees|dollars|usd)\b/i

function formatPhoneForDisplay(value) {
    const raw = String(value || '')
    if (!raw) return ''
    const [left, right] = raw.includes('@') ? raw.split('@') : [raw, '']
    if (right && right !== 's.whatsapp.net') return ''

    const digits = String(left).replace(/[^0-9]/g, '')
    if (!digits) return ''
    if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
    if (digits.length === 12 && digits.startsWith('91')) {
        const local = digits.slice(2)
        return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
    }
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
    return ''
}

function getMessageText(message) {
    if (!message) return ''
    const candidates = [
        message.text,
        message.body,
        message.content,
        message.caption,
        message.message,
        message.raw?.text,
        message.raw?.body,
    ]
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
        if (candidate && typeof candidate === 'object') {
            const nested = candidate.text || candidate.body || candidate.caption
            if (typeof nested === 'string' && nested.trim()) return nested.trim()
        }
    }
    return ''
}

function isIncomingMessage(message) {
    return Boolean(
        message?.direction === 'incoming' ||
        message?.from_me === false ||
        message?.fromMe === false ||
        message?.sender === 'customer' ||
        message?.sender_type === 'customer'
    )
}

function buildSalesInsights(messages, contact) {
    const cleaned = messages
        .map((message) => ({
            text: getMessageText(message),
            incoming: isIncomingMessage(message),
        }))
        .filter((message) => message.text)
        .slice(-40)

    const inbound = cleaned.filter((message) => message.incoming)
    const outbound = cleaned.filter((message) => !message.incoming)
    const clientText = inbound.map((message) => message.text).join(' ')
    const allText = cleaned.map((message) => message.text).join(' ')
    const lowerClient = clientText.toLowerCase()
    const lowerAll = allText.toLowerCase()

    const topicRules = [
        ['Pricing', /\b(price|pricing|cost|amount|budget|fee|charges|payment|invoice|quote)\b/i],
        ['Service fit', /\b(website|landing|design|video|poster|marketing|campaign|plan|package|subscription|service)\b/i],
        ['Follow-up', /\b(call|contact|meeting|demo|schedule|available|tomorrow|today|morning|evening|time)\b/i],
        ['Support', /\b(help|issue|problem|track|order|status|delivery|support)\b/i],
        ['Decision', /\b(interested|need|want|send|share|yes|ok|confirm|final)\b/i],
    ]
    const topics = topicRules.filter(([, rule]) => rule.test(lowerAll)).map(([label]) => label)

    let score = 10
    if (EMAIL_RE.test(clientText)) score += 20
    if (FOLLOW_UP_RE.test(clientText)) score += 20
    if (AMOUNT_RE.test(clientText) || /\b(price|cost|budget|quote|invoice)\b/i.test(clientText)) score += 20
    if (/\b(interested|need|want|send|share|yes|ok|confirm|call me|contact me)\b/i.test(clientText)) score += 25
    if (/\b(not interested|don't|dont|stop|cancel|no need|later)\b/i.test(clientText)) score -= 35
    if (inbound.length >= 3) score += 10
    score = Math.max(0, Math.min(100, score))

    const temperature = score >= 70 ? 'Hot' : score >= 45 ? 'Warm' : score >= 20 ? 'Cold' : 'New'
    const interest = /\b(not interested|don't|dont|stop|cancel|no need)\b/i.test(lowerClient)
        ? 'Not interested'
        : score >= 45
            ? 'Interested'
            : 'Needs qualification'

    const latestClient = inbound.at(-1)?.text || ''
    const latestAgent = outbound.at(-1)?.text || ''
    const summaryParts = []
    if (latestClient) summaryParts.push(`Client last said: "${latestClient.slice(0, 140)}${latestClient.length > 140 ? '...' : ''}"`)
    if (latestAgent) summaryParts.push(`Agent last replied about: "${latestAgent.slice(0, 120)}${latestAgent.length > 120 ? '...' : ''}"`)
    if (!summaryParts.length) summaryParts.push('No readable chat messages available yet.')

    const followUpMatch = clientText.match(FOLLOW_UP_RE)?.[0]
    const nextStep = followUpMatch
        ? `Follow up around ${followUpMatch}.`
        : temperature === 'Hot'
            ? 'Call or message quickly with pricing, proof, and next action.'
            : temperature === 'Warm'
                ? 'Qualify budget, timeline, and required service.'
                : 'Start with a short discovery question before pitching.'

    const objections = []
    if (/\b(price|cost|expensive|budget|high)\b/i.test(lowerClient)) objections.push('Pricing or budget')
    if (/\b(later|busy|tomorrow|time|after)\b/i.test(lowerClient)) objections.push('Timing')
    if (/\b(not interested|no need|cancel|stop)\b/i.test(lowerClient)) objections.push('Low intent')

    return {
        hasMessages: cleaned.length > 0,
        score,
        temperature,
        interest,
        topics: topics.length ? topics : ['General inquiry'],
        summary: summaryParts.join(' '),
        nextStep,
        objections,
        latestClient,
        inboundCount: inbound.length,
        outboundCount: outbound.length,
        savedEmail: contact?.custom_fields?.captured_email || contact?.email || '',
        savedFollowUp: contact?.custom_fields?.follow_up_time || '',
        savedAmount: contact?.custom_fields?.captured_amount || '',
    }
}

function extractClientInfo(messages) {
    const inboundText = messages
        .filter(isIncomingMessage)
        .map(getMessageText)
        .filter(Boolean)
        .join(' ')
    return {
        email: inboundText.match(EMAIL_RE)?.[0] || '',
        followUp: inboundText.match(FOLLOW_UP_RE)?.[0] || '',
        amount: inboundText.match(AMOUNT_RE)?.[0] || '',
    }
}

export default function ContactProfileDrawer({
    isOpen,
    onClose,
    contact,
    conversationId = null,
    onEdit,
    onContactUpdated,
    focusAliasOnOpen = false,
    botEnabled = false,
    onToggleBot = null,
    messages = [],
}) {
    const { apiCall } = useAuth()
    const [activeTab, setActiveTab] = useState('overview')
    const [customName, setCustomName] = useState('')
    const [noteDraft, setNoteDraft] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [isSavingNote, setIsSavingNote] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [autoSaveStatus, setAutoSaveStatus] = useState('')
    const [flowSession, setFlowSession] = useState(null)
    const [handoffSummary, setHandoffSummary] = useState(null)
    const [summaryMeta, setSummaryMeta] = useState(null)

    const aliasInputRef = useRef(null)
    const autoSavedKeyRef = useRef('')

    const displayName = useMemo(() => {
        const custom = String(contact?.custom_name || '').trim()
        if (custom) return custom
        const raw = String(contact?.name || '').trim()
        if (raw && !raw.includes('@') && !/^\d+$/.test(raw)) return raw
        const phone = contact?.phone || contact?.wa_id || ''
        return formatPhoneForDisplay(phone) || 'Unknown'
    }, [contact])

    const phoneDisplay = useMemo(() => formatPhoneForDisplay(contact?.phone || contact?.wa_id || ''), [contact])
    const profilePhotoUrl = contact?.profile_photo_url || contact?.profilePhotoUrl || contact?.photo_url || ''
    const customFields = useMemo(() => contact?.custom_fields && typeof contact.custom_fields === 'object' ? contact.custom_fields : {}, [contact])
    const salesInsights = useMemo(() => buildSalesInsights(messages, contact), [messages, contact])
    const extractedInfo = useMemo(() => extractClientInfo(messages), [messages])
    const displayInsights = useMemo(() => {
        if (!handoffSummary) return salesInsights
        const factTopics = Array.isArray(handoffSummary.important_facts)
            ? handoffSummary.important_facts.map((item) => typeof item === 'string' ? item : item?.label || item?.text).filter(Boolean)
            : []
        const productTopics = Array.isArray(handoffSummary.products_discussed)
            ? handoffSummary.products_discussed.map((item) => typeof item === 'string' ? item : item?.name || item?.text).filter(Boolean)
            : []
        const quality = handoffSummary.lead_quality || salesInsights.temperature
        const normalizedQuality = String(quality || '').toLowerCase()
        const score = normalizedQuality.includes('hot') ? 85 : normalizedQuality.includes('warm') ? 60 : normalizedQuality.includes('cold') ? 25 : salesInsights.score
        return {
            ...salesInsights,
            score,
            temperature: quality,
            interest: handoffSummary.customer_intent || handoffSummary.customer_stage || salesInsights.interest,
            topics: [...factTopics, ...productTopics].slice(0, 6).length ? [...factTopics, ...productTopics].slice(0, 6) : salesInsights.topics,
            summary: handoffSummary.summary_text || salesInsights.summary,
            nextStep: handoffSummary.next_best_action || salesInsights.nextStep,
            objections: Array.isArray(handoffSummary.objections) && handoffSummary.objections.length ? handoffSummary.objections : salesInsights.objections,
        }
    }, [handoffSummary, salesInsights])

    const manualNotes = useMemo(() => {
        const notes = customFields.private_notes
        return Array.isArray(notes) ? notes : []
    }, [customFields.private_notes])

    const visibleCustomFields = useMemo(() => {
        return Object.entries(customFields).filter(([key, value]) => {
            if (INTERNAL_CUSTOM_FIELD_KEYS.has(key)) return false
            return value !== undefined && value !== null && String(value).trim() !== ''
        })
    }, [customFields])

    const patchContact = useCallback(async (payload) => {
        const id = contact?.id
        if (!id) throw new Error('Contact is not synced yet.')
        const res = await apiCall(`${API_BASE}/contacts/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        })
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new Error(body || `Failed to save (HTTP ${res.status})`)
        }
        const updated = await res.json().catch(() => null)
        if (updated && typeof onContactUpdated === 'function') onContactUpdated(updated)
        return updated
    }, [apiCall, contact?.id, onContactUpdated])

    const patchCustomFields = useCallback(async (fieldsPatch) => {
        return patchContact({
            custom_fields: {
                ...customFields,
                ...fieldsPatch,
            },
        })
    }, [customFields, patchContact])

    useEffect(() => {
        setCustomName(String(contact?.custom_name || ''))
        setSaveError('')
        setIsSaving(false)
        setNoteDraft('')
        setAutoSaveStatus('')
        autoSavedKeyRef.current = ''

        if (contact?.id) {
            apiCall(`${API_BASE}/flow-sessions/${contact.id}`)
                .then((res) => res.ok ? res.json() : null)
                .then((data) => setFlowSession(data))
                .catch((err) => console.error('Error fetching flow session', err))
        } else {
            setFlowSession(null)
        }
    }, [apiCall, contact?.id, contact?.custom_name])

    useEffect(() => {
        if (!isOpen || !conversationId) {
            setHandoffSummary(null)
            setSummaryMeta(null)
            return
        }

        apiCall(`${API_BASE}/conversations/${conversationId}/summary`)
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
                setHandoffSummary(data?.summary || null)
                setSummaryMeta(data?.conversation || null)
            })
            .catch((err) => console.error('Error fetching handoff summary', err))
    }, [apiCall, conversationId, isOpen])

    useEffect(() => {
        if (!isOpen || !contact?.id) return

        const fieldsPatch = {}
        if (extractedInfo.email && customFields.captured_email !== extractedInfo.email) fieldsPatch.captured_email = extractedInfo.email
        if (extractedInfo.followUp && customFields.follow_up_time !== extractedInfo.followUp) fieldsPatch.follow_up_time = extractedInfo.followUp
        if (extractedInfo.amount && customFields.captured_amount !== extractedInfo.amount) fieldsPatch.captured_amount = extractedInfo.amount

        const insightPatch = {
            lead_temperature: displayInsights.temperature,
            lead_interest: displayInsights.interest,
            lead_summary: displayInsights.summary,
            lead_next_step: displayInsights.nextStep,
            lead_topics: displayInsights.topics.join(', '),
            sales_note_auto: `Lead ${displayInsights.temperature} (${displayInsights.interest}). ${displayInsights.summary} Next: ${displayInsights.nextStep}`,
        }

        Object.entries(insightPatch).forEach(([key, value]) => {
            if (value && customFields[key] !== value) fieldsPatch[key] = value
        })

        const patchKey = JSON.stringify(fieldsPatch)
        if (!Object.keys(fieldsPatch).length || autoSavedKeyRef.current === patchKey) return

        autoSavedKeyRef.current = patchKey
        setAutoSaveStatus('Saving captured info...')
        patchCustomFields(fieldsPatch)
            .then(() => setAutoSaveStatus('Captured info saved'))
            .catch((err) => {
                console.error('Failed to auto-save contact insights', err)
                setAutoSaveStatus('Auto-save failed')
            })
    }, [isOpen, contact?.id, extractedInfo, displayInsights, customFields, patchCustomFields])

    useEffect(() => {
        if (!isOpen || !focusAliasOnOpen) return
        setActiveTab('overview')
        const t = setTimeout(() => {
            aliasInputRef.current?.focus?.()
            aliasInputRef.current?.select?.()
        }, 50)
        return () => clearTimeout(t)
    }, [isOpen, focusAliasOnOpen])

    const cancelFlow = async () => {
        if (!flowSession?.id) return
        try {
            await apiCall(`${API_BASE}/flow-sessions/${flowSession.id}`, { method: 'DELETE' })
            setFlowSession(null)
        } catch (e) {
            console.error('Failed to cancel flow', e)
        }
    }

    const saveCustomName = async () => {
        setIsSaving(true)
        setSaveError('')
        try {
            await patchContact({ custom_name: customName })
        } catch (e) {
            setSaveError(e?.message || 'Failed to save')
        } finally {
            setIsSaving(false)
        }
    }

    const saveManualNote = async () => {
        const text = noteDraft.trim()
        if (!text) return
        setIsSavingNote(true)
        setSaveError('')
        try {
            await patchCustomFields({
                private_notes: [
                    {
                        text,
                        at: new Date().toISOString(),
                        author: 'You',
                    },
                    ...manualNotes,
                ],
            })
            setNoteDraft('')
        } catch (e) {
            setSaveError(e?.message || 'Failed to save note')
        } finally {
            setIsSavingNote(false)
        }
    }

    if (!isOpen || !contact) return null

    const heatClass = displayInsights.temperature === 'Hot'
        ? 'bg-red-50 text-red-700 border-red-200'
        : displayInsights.temperature === 'Warm'
            ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-slate-50 text-slate-700 border-slate-200'

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />

            <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
                <div className="w-screen max-w-lg transform bg-white shadow-2xl flex flex-col h-full">
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
                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${heatClass}`}>
                                    <Flame className="h-3.5 w-3.5" />
                                    {displayInsights.temperature} lead
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                                    <Target className="h-3.5 w-3.5" />
                                    {displayInsights.interest}
                                </span>
                            </div>
                            <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
                                {[
                                    { icon: Phone, label: 'Voice' },
                                    { icon: Search, label: 'Search' },
                                ].map((action) => (
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

                    <div className="border-y border-gray-200 bg-white">
                        <nav className="-mb-px flex px-6" aria-label="Tabs">
                            {[
                                ['overview', 'Overview'],
                                ['chat', 'Sales brief'],
                                ['notes', 'Notes'],
                            ].map(([tab, label]) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`w-1/3 py-4 px-1 text-center border-b-2 text-sm font-medium ${
                                        activeTab === tab
                                            ? 'border-green-500 text-green-700'
                                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 bg-gray-50">
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => onEdit(contact)}
                                        className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm"
                                    >
                                        <Edit className="h-4 w-4" /> Edit Details
                                    </button>
                                    <button className="flex items-center justify-center gap-2 bg-green-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-green-700 shadow-sm">
                                        <MessageSquare className="h-4 w-4" /> Send Message
                                    </button>
                                </div>

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
                                        {saveError ? <div className="text-xs text-red-600">{saveError}</div> : null}
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

                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-4 py-5 sm:p-6 space-y-4">
                                        <div className="flex items-center gap-3 text-sm">
                                            <Mail className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-900">{customFields.captured_email || contact.email || 'No email provided'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <Phone className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-900 font-mono">{phoneDisplay || 'No phone provided'}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <Calendar className="h-4 w-4 text-gray-400" />
                                            <span className="text-gray-500">Joined {format(new Date(contact.created_at || Date.now()), 'MMMM d, yyyy')}</span>
                                        </div>
                                        {customFields.follow_up_time ? (
                                            <div className="flex items-center gap-3 text-sm">
                                                <Clock className="h-4 w-4 text-gray-400" />
                                                <span className="text-gray-900">Follow up: {customFields.follow_up_time}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 ml-1">Automation status</h4>
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="px-4 py-3 flex justify-between items-center text-sm border-b border-gray-100">
                                            <span className="text-gray-500 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Bot auto reply</span>
                                            <button
                                                onClick={() => onToggleBot && onToggleBot(!botEnabled)}
                                                className={`font-semibold px-3 py-1 rounded-full text-xs transition-colors shadow-sm active:scale-95 ${
                                                    botEnabled ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                }`}
                                            >
                                                {botEnabled ? 'ENABLED' : 'DISABLED'}
                                            </button>
                                        </div>
                                        <div className="px-4 py-3 flex justify-between items-center text-sm">
                                            <span className="text-gray-500 flex items-center gap-2"><Send className="h-4 w-4" /> Active flow</span>
                                            <div className="flex items-center gap-2">
                                                {flowSession ? (
                                                    <>
                                                        <span className="font-semibold px-2 py-0.5 rounded-md text-xs bg-green-100 text-green-700 max-w-[160px] truncate" title={flowSession?.flows?.name}>
                                                            {flowSession?.flows?.name || 'In Progress'}
                                                        </span>
                                                        <button onClick={cancelFlow} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded" title="Stop flow">
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

                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 ml-1">Custom attributes</h4>
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                                        {visibleCustomFields.length > 0 ? (
                                            visibleCustomFields.map(([key, value]) => (
                                                <div key={key} className="px-4 py-3 flex justify-between gap-4 text-sm">
                                                    <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                                                    <span className="font-medium text-gray-900 text-right">{String(value)}</span>
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
                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-900">Human handoff summary</div>
                                            <p className="mt-1 text-xs text-gray-500">
                                                {handoffSummary
                                                    ? `Generated by ${handoffSummary.generated_by || 'n8n'}`
                                                    : summaryMeta?.summary_status === 'pending'
                                                        ? 'n8n summary is pending.'
                                                        : 'Condensed from recent messages for the sales executive.'}
                                            </p>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${heatClass}`}>
                                            <Flame className="h-3.5 w-3.5" />
                                            {displayInsights.score}/100
                                        </span>
                                    </div>
                                    <div className="mt-4 h-2 rounded-full bg-gray-100">
                                        <div className="h-2 rounded-full bg-green-500" style={{ width: `${displayInsights.score}%` }} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                        <div className="text-xs font-semibold uppercase text-gray-500">Lead quality</div>
                                        <div className="mt-2 text-lg font-semibold text-gray-900">{displayInsights.temperature}</div>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                        <div className="text-xs font-semibold uppercase text-gray-500">Intent</div>
                                        <div className="mt-2 text-lg font-semibold text-gray-900">{displayInsights.interest}</div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <ClipboardList className="h-4 w-4 text-green-600" />
                                        Conversation summary
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-gray-700">{displayInsights.summary}</p>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <Target className="h-4 w-4 text-green-600" />
                                        Next best action
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-gray-700">{displayInsights.nextStep}</p>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="text-sm font-semibold text-gray-900">Main topics</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {displayInsights.topics.map((topic) => (
                                            <span key={topic} className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                                                {topic}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="text-sm font-semibold text-gray-900">Captured client info</div>
                                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                                        <InfoRow label="Email" value={customFields.captured_email || extractedInfo.email || 'Not shared'} />
                                        <InfoRow label="Follow-up" value={customFields.follow_up_time || extractedInfo.followUp || 'Not shared'} />
                                        <InfoRow label="Amount" value={customFields.captured_amount || extractedInfo.amount || 'Not shared'} />
                                        <InfoRow label="Messages" value={`${salesInsights.inboundCount} client, ${salesInsights.outboundCount} agent`} />
                                    </div>
                                    {autoSaveStatus ? <div className="mt-3 text-xs text-gray-500">{autoSaveStatus}</div> : null}
                                </div>

                                {displayInsights.objections.length ? (
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                                            <BadgeInfo className="h-4 w-4" />
                                            Watch points
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {displayInsights.objections.map((item) => (
                                                <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {activeTab === 'notes' && (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-green-900">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Auto-saved insight
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-green-900">{customFields.sales_note_auto || displayInsights.summary}</p>
                                    {autoSaveStatus ? <div className="mt-2 text-xs text-green-700">{autoSaveStatus}</div> : null}
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <StickyNote className="h-4 w-4 text-green-600" />
                                        Private note
                                    </div>
                                    <textarea
                                        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm shadow-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                                        rows={4}
                                        value={noteDraft}
                                        onChange={(e) => setNoteDraft(e.target.value)}
                                        placeholder="Add a private note about this contact..."
                                    />
                                    <button
                                        onClick={saveManualNote}
                                        disabled={isSavingNote || !noteDraft.trim()}
                                        className="mt-3 w-full bg-gray-900 text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
                                    >
                                        {isSavingNote ? 'Saving...' : 'Save note'}
                                    </button>
                                </div>

                                {manualNotes.length ? (
                                    <div className="space-y-3">
                                        {manualNotes.map((note, index) => (
                                            <div key={`${note.at || 'note'}-${index}`} className="rounded-xl border border-yellow-100 bg-yellow-50 p-4">
                                                <p className="text-sm leading-6 text-gray-800">{note.text}</p>
                                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                                    <Clock className="h-3 w-3" />
                                                    {note.at ? format(new Date(note.at), 'MMM d, h:mm a') : 'Saved note'} by {note.author || 'You'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-500">
                                        No manual notes yet.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function InfoRow({ label, value }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="text-gray-500">{label}</span>
            <span className="text-right font-medium text-gray-900">{value}</span>
        </div>
    )
}
