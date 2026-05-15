import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
    AlertCircle,
    Building2,
    Calendar,
    Check,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    CreditCard,
    Database,
    Edit3,
    FileText,
    Filter,
    IndianRupee,
    Layers3,
    Mail,
    MapPin,
    MoreHorizontal,
    Phone,
    Plus,
    Save,
    Search,
    Tag,
    Trash2,
    Upload,
    UserRound,
    X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

const FIELD_GROUPS = [
    {
        label: 'Identity',
        icon: UserRound,
        fields: [
            { key: 'email', label: 'Email', type: 'email', placeholder: 'customer@example.com' },
            { key: 'alternate_phone', label: 'Alt phone', type: 'tel', placeholder: '+91 98765 43210' },
            { key: 'company', label: 'Company', type: 'text', placeholder: 'Business / organization' },
            { key: 'source', label: 'Source', type: 'text', placeholder: 'Instagram, referral, website' },
        ],
    },
    {
        label: 'Billing',
        icon: IndianRupee,
        fields: [
            { key: 'invoice', label: 'Invoice', type: 'text', placeholder: 'INV-1024' },
            { key: 'amount', label: 'Amount', type: 'number', placeholder: '10000' },
            { key: 'payment_status', label: 'Payment status', type: 'text', placeholder: 'paid, pending, overdue' },
            { key: 'due_date', label: 'Due date', type: 'date', placeholder: '' },
        ],
    },
    {
        label: 'Address',
        icon: MapPin,
        fields: [
            { key: 'address', label: 'Address', type: 'textarea', placeholder: 'Full delivery or billing address' },
            { key: 'city', label: 'City', type: 'text', placeholder: 'Bhopal' },
            { key: 'state', label: 'State', type: 'text', placeholder: 'Madhya Pradesh' },
            { key: 'pincode', label: 'Pincode', type: 'text', placeholder: '462001' },
        ],
    },
    {
        label: 'Service',
        icon: ClipboardList,
        fields: [
            { key: 'plan', label: 'Plan', type: 'text', placeholder: 'Premium / monthly' },
            { key: 'period', label: 'Period', type: 'text', placeholder: 'Jan 2026 - Mar 2026' },
            { key: 'status', label: 'Status', type: 'text', placeholder: 'active, renewal, completed' },
            { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Private notes for this customer' },
        ],
    },
    {
        label: 'Education',
        icon: FileText,
        fields: [
            { key: 'course', label: 'Course', type: 'text', placeholder: 'Course / program' },
            { key: 'batch', label: 'Batch', type: 'text', placeholder: 'Morning / 2026' },
            { key: 'form_id', label: 'Form ID', type: 'text', placeholder: 'Application ID' },
            { key: 'admission_status', label: 'Admission status', type: 'text', placeholder: 'submitted, pending, done' },
        ],
    },
]

const FIELD_PRESETS = FIELD_GROUPS.flatMap(group => group.fields)
const FIELD_PRESET_BY_KEY = FIELD_PRESETS.reduce((acc, field) => ({ ...acc, [field.key]: field }), {})

const HIDDEN_CUSTOM_FIELDS = new Set(['profile_photo_url', 'profile_photo_checked_at'])

const emptyDraft = {
    id: null,
    name: '',
    custom_name: '',
    phone: '',
    tagsText: '',
    wa_account_id: '',
    fields: [],
}

export default function Contacts() {
    const { session, apiCall } = useAuth()
    const queryClient = useQueryClient()
    const fileInputRef = useRef(null)

    const [searchTerm, setSearchTerm] = useState('')
    const [tagFilter, setTagFilter] = useState('')
    const [accountFilter, setAccountFilter] = useState('')
    const [fieldFilter, setFieldFilter] = useState('')
    const [activeContact, setActiveContact] = useState(null)
    const [drawerMode, setDrawerMode] = useState('view')
    const [draft, setDraft] = useState(emptyDraft)
    const [importStatus, setImportStatus] = useState('')

    const authEnabled = !!session?.access_token

    const isHumanContact = (c) => {
        const waId = String(c?.wa_id || '').trim().toLowerCase()
        if (!waId) return true
        if (waId === 'status@broadcast') return false
        if (waId.includes('@g.us')) return false
        if (waId.includes('@newsletter')) return false
        if (waId.includes('@') && !waId.endsWith('@s.whatsapp.net')) return false
        return true
    }

    const { data: contacts = [], isLoading: contactsLoading, error: contactsError } = useQuery({
        queryKey: ['contacts', session?.access_token],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/contacts`)
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(body || `Failed to fetch contacts (${res.status})`)
            }
            const data = await res.json()
            const rows = Array.isArray(data) ? data : []
            return rows.filter(isHumanContact)
        },
        staleTime: 1000 * 60 * 3,
        enabled: authEnabled,
    })

    const { data: accounts = [] } = useQuery({
        queryKey: ['wa-accounts', session?.access_token],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/whatsapp/accounts`)
            if (!res.ok) return []
            const data = await res.json()
            return Array.isArray(data) ? data : []
        },
        staleTime: 1000 * 60 * 5,
        enabled: authEnabled,
    })

    const formatPhoneForDisplay = (value) => {
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

    const getDisplayName = (contact) => {
        const custom = String(contact?.custom_name || '').trim()
        if (custom) return custom
        const rawName = String(contact?.name || '').trim()
        if (rawName && !rawName.includes('@') && !/^\d+$/.test(rawName)) return rawName
        return formatPhoneForDisplay(contact?.phone || contact?.wa_id) || 'Unknown'
    }

    const getPhone = (contact) => formatPhoneForDisplay(contact?.phone || contact?.wa_id) || ''

    const getAccountLabel = (contactOrAccount) => {
        const account = contactOrAccount?.wa_account_id
            ? accounts.find(item => item.id === contactOrAccount.wa_account_id) || contactOrAccount.account
            : contactOrAccount?.account || contactOrAccount
        if (!account) return 'Unassigned'
        return account.name || account.display_phone_number || account.phone_number_id || 'WhatsApp account'
    }

    const visibleCustomFields = (contact) => Object.entries(contact?.custom_fields || {})
        .filter(([key, value]) => !HIDDEN_CUSTOM_FIELDS.has(key) && value !== null && value !== undefined && String(value).trim() !== '')

    const getFieldMeta = (key) => {
        const normalized = String(key || '').trim()
        return FIELD_PRESET_BY_KEY[normalized] || { key: normalized, label: normalized || 'Custom field', type: 'text', placeholder: 'Value' }
    }

    const allTags = useMemo(() => {
        const tags = new Set()
        contacts.forEach(contact => (contact.tags || []).forEach(tag => tags.add(tag)))
        return Array.from(tags).sort((a, b) => a.localeCompare(b))
    }, [contacts])

    const allFieldKeys = useMemo(() => {
        const keys = new Set()
        contacts.forEach(contact => visibleCustomFields(contact).forEach(([key]) => keys.add(key)))
        return Array.from(keys).sort((a, b) => a.localeCompare(b))
    }, [contacts])

    const stats = useMemo(() => {
        const withFields = contacts.filter(contact => visibleCustomFields(contact).length > 0).length
        const withTags = contacts.filter(contact => (contact.tags || []).length > 0).length
        const assigned = contacts.filter(contact => contact.wa_account_id || contact.account?.id).length
        return { total: contacts.length, withFields, withTags, assigned }
    }, [contacts])

    const query = searchTerm.trim().toLowerCase()
    const filteredContacts = contacts.filter(contact => {
        const fieldEntries = visibleCustomFields(contact)
        const searchable = [
            getDisplayName(contact),
            getPhone(contact),
            contact.wa_id,
            getAccountLabel(contact),
            ...(contact.tags || []),
            ...fieldEntries.flatMap(([key, value]) => [key, String(value)]),
        ].join(' ').toLowerCase()
        const matchesSearch = !query || searchable.includes(query)
        const matchesTag = !tagFilter || (contact.tags || []).includes(tagFilter)
        const contactAccountId = contact.wa_account_id || contact.account?.id || ''
        const matchesAccount = !accountFilter || contactAccountId === accountFilter
        const matchesField = !fieldFilter || fieldEntries.some(([key]) => key === fieldFilter)
        return matchesSearch && matchesTag && matchesAccount && matchesField
    })

    const hydrateDraft = (contact = null) => {
        if (!contact) return { ...emptyDraft, fields: [] }
        return {
            id: contact.id,
            name: String(contact.name || ''),
            custom_name: String(contact.custom_name || ''),
            phone: getPhone(contact) || String(contact.phone || contact.wa_id || ''),
            tagsText: (contact.tags || []).join(', '),
            wa_account_id: contact.wa_account_id || contact.account?.id || '',
            fields: visibleCustomFields(contact).map(([key, value]) => ({ key, value: String(value ?? '') })),
        }
    }

    useEffect(() => {
        if (!activeContact?.id) return
        const fresh = contacts.find(contact => contact.id === activeContact.id)
        if (fresh) setActiveContact(fresh)
    }, [contacts, activeContact?.id])

    const parseTags = (value) => String(value || '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)

    const fieldsToObject = (fields) => fields.reduce((acc, field) => {
        const key = String(field.key || '').trim()
        if (key) acc[key] = String(field.value ?? '').trim()
        return acc
    }, {})

    const buildPayload = (source) => ({
        name: source.name,
        custom_name: source.custom_name,
        phone: source.phone,
        tags: parseTags(source.tagsText),
        wa_account_id: source.wa_account_id || null,
        custom_fields: fieldsToObject(source.fields),
    })

    const saveMutation = useMutation({
        mutationFn: async (source) => {
            const isEdit = Boolean(source.id)
            const res = await apiCall(`${API_BASE}/contacts${isEdit ? `/${source.id}` : ''}`, {
                method: isEdit ? 'PATCH' : 'POST',
                body: JSON.stringify(buildPayload(source)),
            })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error || `Failed to save contact (${res.status})`)
            }
            return res.json()
        },
        onSuccess: (updated) => {
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            setActiveContact(updated)
            setDraft(hydrateDraft(updated))
            setDrawerMode('view')
        },
    })

    const deleteMutation = useMutation({
        mutationFn: async (contact) => {
            const res = await apiCall(`${API_BASE}/contacts/${contact.id}`, { method: 'DELETE' })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error || 'Failed to delete contact')
            }
            return true
        },
        onSuccess: () => {
            setActiveContact(null)
            setDrawerMode('view')
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
        },
    })

    const openContact = (contact) => {
        setActiveContact(contact)
        setDraft(hydrateDraft(contact))
        setDrawerMode('view')
    }

    const openNewContact = () => {
        setActiveContact(null)
        setDraft({ ...emptyDraft, fields: [{ key: 'source', value: '' }] })
        setDrawerMode('edit')
    }

    const updateDraft = (patch) => setDraft(prev => ({ ...prev, ...patch }))

    const addField = (key = '', value = '') => {
        setDraft(prev => ({ ...prev, fields: [...prev.fields, { key, value }] }))
    }

    const addFieldGroup = (group) => {
        setDraft(prev => {
            const existing = new Set(prev.fields.map(field => field.key))
            const nextFields = group.fields
                .filter(field => !existing.has(field.key))
                .map(field => ({ key: field.key, value: '' }))
            return { ...prev, fields: [...prev.fields, ...nextFields] }
        })
    }

    const updateField = (index, patch) => {
        setDraft(prev => ({
            ...prev,
            fields: prev.fields.map((field, i) => i === index ? { ...field, ...patch } : field),
        }))
    }

    const removeField = (index) => {
        setDraft(prev => ({ ...prev, fields: prev.fields.filter((_, i) => i !== index) }))
    }

    const parseCsvLine = (line) => {
        const values = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]
            if (ch === '"' && line[i + 1] === '"') {
                current += '"'
                i++
            } else if (ch === '"') {
                inQuotes = !inQuotes
            } else if (ch === ',' && !inQuotes) {
                values.push(current.trim())
                current = ''
            } else {
                current += ch
            }
        }
        values.push(current.trim())
        return values
    }

    const handleImportCsv = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return

        try {
            setImportStatus('Importing CSV...')
            const text = await file.text()
            const lines = text.split(/\r?\n/).filter(line => line.trim())
            if (lines.length < 2) throw new Error('CSV must include a header row and at least one contact')

            const headers = parseCsvLine(lines[0])
            const normalized = headers.map(header => header.toLowerCase().trim())
            const nameIdx = normalized.findIndex(header => header.includes('name'))
            const phoneIdx = normalized.findIndex(header => header.includes('phone') || header.includes('mobile') || header.includes('number'))
            const tagsIdx = normalized.findIndex(header => header.includes('tag'))
            const accountIdx = normalized.findIndex(header => header.includes('account'))
            if (phoneIdx === -1) throw new Error('CSV needs a phone/mobile/number column')

            const reserved = new Set([nameIdx, phoneIdx, tagsIdx, accountIdx].filter(index => index >= 0))
            let imported = 0
            let failed = 0
            for (const line of lines.slice(1)) {
                const cols = parseCsvLine(line)
                const phone = cols[phoneIdx]
                if (!phone) continue
                const accountText = accountIdx >= 0 ? String(cols[accountIdx] || '').trim().toLowerCase() : ''
                const account = accountText
                    ? accounts.find(acc => [acc.id, acc.name, acc.display_phone_number, acc.phone_number_id].some(value => String(value || '').toLowerCase() === accountText))
                    : null
                const custom_fields = headers.reduce((acc, header, index) => {
                    if (reserved.has(index)) return acc
                    const key = String(header || '').trim()
                    const value = String(cols[index] || '').trim()
                    if (key && value) acc[key] = value
                    return acc
                }, {})

                try {
                    const res = await apiCall(`${API_BASE}/contacts`, {
                        method: 'POST',
                        body: JSON.stringify({
                            name: nameIdx >= 0 ? cols[nameIdx] : '',
                            phone,
                            tags: tagsIdx >= 0 ? cols[tagsIdx] : '',
                            wa_account_id: account?.id || null,
                            custom_fields,
                        }),
                    })
                    if (!res.ok) throw new Error('failed')
                    imported++
                } catch {
                    failed++
                }
            }

            setImportStatus(`Imported ${imported} contact${imported === 1 ? '' : 's'}${failed ? `, skipped ${failed}` : ''}. Extra CSV columns were saved as custom fields.`)
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
        } catch (err) {
            setImportStatus('')
            alert(err.message)
        }
    }

    const resetFilters = () => {
        setSearchTerm('')
        setTagFilter('')
        setAccountFilter('')
        setFieldFilter('')
    }

    const selectedFields = visibleCustomFields(activeContact)
    const topFields = (contact) => visibleCustomFields(contact).slice(0, 4)
    const accountOptions = [
        { value: '', label: 'All accounts' },
        ...accounts.map(account => ({ value: account.id, label: getAccountLabel(account), helper: account.display_phone_number || account.phone_number_id || '' })),
    ]
    const assignAccountOptions = [
        { value: '', label: 'Unassigned' },
        ...accounts.map(account => ({ value: account.id, label: getAccountLabel(account), helper: account.display_phone_number || account.phone_number_id || '' })),
    ]
    const tagOptions = [{ value: '', label: 'All tags' }, ...allTags.map(tag => ({ value: tag, label: tag }))]
    const fieldOptions = [{ value: '', label: 'All fields' }, ...allFieldKeys.map(key => ({ value: key, label: getFieldMeta(key).label }))]

    return (
        <div className="min-h-full bg-gray-50/70">
            <div className="space-y-5 px-4 py-5 lg:px-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-950">Contacts</h1>
                        <p className="mt-1 text-sm text-gray-500">Manage customer profiles, account ownership, tags, and flexible business data.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={handleImportCsv}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
                        >
                            <Upload className="h-4 w-4" />
                            Import CSV
                        </button>
                        <button
                            type="button"
                            onClick={openNewContact}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-100 hover:bg-indigo-700"
                        >
                            <Plus className="h-4 w-4" />
                            Add Contact
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                        { label: 'Total contacts', value: stats.total, icon: UserRound },
                        { label: 'With account', value: stats.assigned, icon: Building2 },
                        { label: 'Tagged', value: stats.withTags, icon: Tag },
                        { label: 'Custom data', value: stats.withFields, icon: Database },
                    ].map(item => (
                        <div key={item.label} className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-medium text-gray-500">{item.label}</div>
                                <item.icon className="h-4 w-4 text-gray-400" />
                            </div>
                            <div className="mt-2 text-2xl font-bold text-gray-950">{item.value}</div>
                        </div>
                    ))}
                </div>

                {importStatus ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                        {importStatus}
                    </div>
                ) : null}

                {(contactsError || saveMutation.error || deleteMutation.error) ? (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{contactsError?.message || saveMutation.error?.message || deleteMutation.error?.message}</span>
                    </div>
                ) : null}

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 xl:flex-row">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                            <input
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search name, phone, tag, account, invoice, address, amount..."
                                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/20"
                            />
                        </div>
                        <CustomSelect value={accountFilter} onChange={setAccountFilter} options={accountOptions} className="xl:w-44" />
                        <CustomSelect value={tagFilter} onChange={setTagFilter} options={tagOptions} className="xl:w-40" />
                        <CustomSelect value={fieldFilter} onChange={setFieldFilter} options={fieldOptions} className="xl:w-40" />
                        <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                            <Filter className="h-4 w-4" />
                            Reset
                        </button>
                    </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                                <tr>
                                    <th className="px-5 py-3">Customer</th>
                                    <th className="px-5 py-3">Account</th>
                                    <th className="px-5 py-3">Tags</th>
                                    <th className="px-5 py-3">Business data</th>
                                    <th className="px-5 py-3">Activity</th>
                                    <th className="px-5 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {contactsLoading ? (
                                    <tr>
                                        <td colSpan="6" className="px-5 py-10 text-center text-sm text-gray-500">Loading contacts...</td>
                                    </tr>
                                ) : filteredContacts.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-5 py-10 text-center text-sm text-gray-500">No contacts match this view.</td>
                                    </tr>
                                ) : filteredContacts.map(contact => (
                                    <tr key={contact.id} onClick={() => openContact(contact)} className="cursor-pointer bg-white transition hover:bg-gray-50">
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 text-sm font-bold text-white shadow-sm">
                                                    {String(getDisplayName(contact)).slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate font-semibold text-gray-950">{getDisplayName(contact)}</div>
                                                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-gray-500">
                                                        <Phone className="h-3 w-3" />
                                                        {getPhone(contact) || contact.wa_id || '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="inline-flex max-w-[210px] items-center gap-2 rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                                                <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                                <span className="truncate">{getAccountLabel(contact)}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex max-w-[220px] flex-wrap gap-1">
                                                {(contact.tags || []).slice(0, 3).map(tag => (
                                                    <span key={tag} className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{tag}</span>
                                                ))}
                                                {(contact.tags || []).length > 3 ? <span className="text-xs text-gray-400">+{contact.tags.length - 3}</span> : null}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            {topFields(contact).length > 0 ? (
                                                <BusinessDataCell fields={visibleCustomFields(contact)} />
                                            ) : (
                                                <span className="text-xs text-gray-400">No custom data</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 text-xs text-gray-500">
                                            <div className="flex items-center gap-1">
                                                <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                                {contact.last_active ? format(new Date(contact.last_active), 'MMM d, yyyy h:mm a') : contact.created_at ? format(new Date(contact.created_at), 'MMM d, yyyy') : '-'}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <button type="button" onClick={(event) => { event.stopPropagation(); openContact(contact) }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                                                <MoreHorizontal className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
                        <span>Showing <strong className="text-gray-800">{filteredContacts.length}</strong> of <strong className="text-gray-800">{contacts.length}</strong> contacts</span>
                        <span>{allFieldKeys.length} custom field types</span>
                    </div>
                </div>
            </div>

            {(activeContact || drawerMode === 'edit') ? (
                <div className="fixed inset-0 z-50 overflow-hidden">
                    <div className="absolute inset-0 bg-gray-950/30" onClick={() => { setActiveContact(null); setDrawerMode('view') }} />
                    <div className="absolute inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl">
                        <div className="flex h-full flex-col">
                            <div className="border-b border-gray-200 px-5 py-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{draft.id ? 'Contact profile' : 'New contact'}</div>
                                        <h2 className="mt-1 truncate text-xl font-bold text-gray-950">{draft.id ? getDisplayName(activeContact) : 'Add customer data'}</h2>
                                        <p className="mt-1 text-sm text-gray-500">{draft.id ? getPhone(activeContact) || activeContact?.wa_id : 'Save phone, account, tags, and any extra fields.'}</p>
                                    </div>
                                    <button type="button" onClick={() => { setActiveContact(null); setDrawerMode('view') }} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                                {draft.id ? (
                                    <div className="mt-4 flex gap-2">
                                        <button type="button" onClick={() => setDrawerMode('view')} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${drawerMode === 'view' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Overview</button>
                                        <button type="button" onClick={() => { setDraft(hydrateDraft(activeContact)); setDrawerMode('edit') }} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${drawerMode === 'edit' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Edit</button>
                                    </div>
                                ) : null}
                            </div>

                            <div className="flex-1 overflow-y-auto bg-gray-50 p-5">
                                {drawerMode === 'view' && activeContact ? (
                                    <div className="space-y-5">
                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-emerald-600 text-xl font-bold text-white">
                                                    {String(getDisplayName(activeContact)).slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-lg font-bold text-gray-950">{getDisplayName(activeContact)}</div>
                                                    <div className="mt-1 font-mono text-sm text-gray-500">{getPhone(activeContact) || activeContact.wa_id || '-'}</div>
                                                </div>
                                            </div>
                                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                                <InfoRow label="Account" value={getAccountLabel(activeContact)} />
                                                <InfoRow label="WhatsApp ID" value={activeContact.wa_id || '-'} mono />
                                                <InfoRow label="Joined" value={activeContact.created_at ? format(new Date(activeContact.created_at), 'MMM d, yyyy') : '-'} />
                                                <InfoRow label="Last active" value={activeContact.last_active ? format(new Date(activeContact.last_active), 'MMM d, yyyy h:mm a') : '-'} />
                                            </div>
                                        </section>

                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <div className="mb-3 flex items-center justify-between">
                                                <h3 className="text-sm font-bold text-gray-950">Tags</h3>
                                                <Tag className="h-4 w-4 text-gray-400" />
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {(activeContact.tags || []).length ? activeContact.tags.map(tag => (
                                                    <span key={tag} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">{tag}</span>
                                                )) : <span className="text-sm text-gray-500">No tags yet</span>}
                                            </div>
                                        </section>

                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <div className="mb-3 flex items-center justify-between">
                                                <h3 className="text-sm font-bold text-gray-950">Flexible data</h3>
                                                <Layers3 className="h-4 w-4 text-gray-400" />
                                            </div>
                                            {selectedFields.length ? (
                                                <div className="divide-y divide-gray-100">
                                                    {selectedFields.map(([key, value]) => (
                                                        <div key={key} className="grid grid-cols-[150px_1fr] gap-4 py-3 text-sm">
                                                            <div className="font-medium text-gray-500">{key}</div>
                                                            <div className="break-words font-semibold text-gray-900">{String(value)}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                                                    No invoice, address, amount, period, or other custom data saved yet.
                                                </div>
                                            )}
                                        </section>
                                    </div>
                                ) : (
                                    <form id="contact-editor" onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(draft) }} className="space-y-5">
                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <h3 className="mb-4 text-sm font-bold text-gray-950">Core details</h3>
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <Field label="Name">
                                                    <input value={draft.name} onChange={event => updateDraft({ name: event.target.value })} className="field-input" placeholder="Customer name" />
                                                </Field>
                                                <Field label="Alias">
                                                    <input value={draft.custom_name} onChange={event => updateDraft({ custom_name: event.target.value })} className="field-input" placeholder="Private display name" />
                                                </Field>
                                                <Field label="Phone">
                                                    <input required value={draft.phone} onChange={event => updateDraft({ phone: event.target.value })} className="field-input" placeholder="+91 98765 43210" />
                                                </Field>
                                                <Field label="WhatsApp account">
                                                    <CustomSelect
                                                        value={draft.wa_account_id}
                                                        onChange={value => updateDraft({ wa_account_id: value })}
                                                        options={assignAccountOptions}
                                                    />
                                                </Field>
                                            </div>
                                            <Field label="Tags" className="mt-4">
                                                <input value={draft.tagsText} onChange={event => updateDraft({ tagsText: event.target.value })} className="field-input" placeholder="lead, vip, renewal" />
                                            </Field>
                                        </section>

                                        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <div>
                                                    <h3 className="text-sm font-bold text-gray-950">Flexible fields</h3>
                                                    <p className="mt-1 text-xs text-gray-500">Save invoice, address, amount, period, plan, notes, or any business-specific data.</p>
                                                </div>
                                                <button type="button" onClick={() => addField()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                                                    <Plus className="h-4 w-4" />
                                                    Field
                                                </button>
                                            </div>

                                            <div className="mb-4 grid gap-2 sm:grid-cols-2">
                                                {FIELD_GROUPS.map(group => (
                                                    <div key={group.label} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                                                                <group.icon className="h-4 w-4 text-gray-500" />
                                                                {group.label}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => addFieldGroup(group)}
                                                                className="rounded-md px-2 py-1 text-xs font-bold text-green-700 hover:bg-green-50"
                                                            >
                                                                Add set
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {group.fields.map(field => (
                                                                <button
                                                                    key={field.key}
                                                                    type="button"
                                                                    onClick={() => addField(field.key, '')}
                                                                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 hover:border-green-200 hover:bg-green-50 hover:text-green-700"
                                                                >
                                                                    {field.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="space-y-2">
                                                {draft.fields.length === 0 ? (
                                                    <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">No custom fields. Add only the data this customer needs.</div>
                                                ) : draft.fields.map((field, index) => (
                                                    <div key={`${index}-${field.key}`} className="grid gap-2 rounded-lg border border-gray-100 bg-white p-2 sm:grid-cols-[190px_1fr_40px]">
                                                        <div>
                                                            <input
                                                                value={field.key}
                                                                onChange={event => updateField(index, { key: event.target.value })}
                                                                className="field-input"
                                                                placeholder="field name"
                                                                list="contact-field-presets"
                                                            />
                                                        </div>
                                                        <FieldValueInput field={field} onChange={value => updateField(index, { value })} meta={getFieldMeta(field.key)} />
                                                        <button type="button" onClick={() => removeField(index)} className="flex h-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <datalist id="contact-field-presets">
                                                {FIELD_PRESETS.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
                                            </datalist>
                                        </section>
                                    </form>
                                )}
                            </div>

                            <div className="border-t border-gray-200 bg-white px-5 py-4">
                                {drawerMode === 'view' && activeContact ? (
                                    <div className="flex justify-between gap-3">
                                        <button type="button" onClick={() => deleteMutation.mutate(activeContact)} disabled={deleteMutation.isPending} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                                            <Trash2 className="h-4 w-4" />
                                            Delete
                                        </button>
                                        <button type="button" onClick={() => { setDraft(hydrateDraft(activeContact)); setDrawerMode('edit') }} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                                            <Edit3 className="h-4 w-4" />
                                            Edit contact
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex justify-end gap-3">
                                        <button type="button" onClick={() => { if (activeContact) setDrawerMode('view'); else setActiveContact(null) }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                                        <button type="submit" form="contact-editor" disabled={saveMutation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                                            <Save className="h-4 w-4" />
                                            {saveMutation.isPending ? 'Saving...' : 'Save contact'}
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    )
}

function Field({ label, children, className = '' }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
            {children}
        </label>
    )
}

function InfoRow({ label, value, mono = false }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                {label}
            </div>
            <div className={`truncate text-sm font-semibold text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</div>
        </div>
    )
}

function CustomSelect({ value, onChange, options, className = '' }) {
    const [open, setOpen] = useState(false)
    const selected = options.find(option => option.value === value) || options[0]

    return (
        <div className={`relative ${className}`}>
            <button
                type="button"
                onClick={() => setOpen(current => !current)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                className={`flex h-[42px] w-full min-w-36 items-center justify-between gap-3 rounded-lg border bg-white px-3 text-left text-sm font-semibold shadow-sm outline-none transition ${open ? 'border-green-500 ring-2 ring-green-500/20' : 'border-gray-300 hover:border-gray-400'}`}
            >
                <span className="min-w-0">
                    <span className="block truncate text-gray-900">{selected?.label || 'Select'}</span>
                    {selected?.helper ? <span className="block truncate text-[10px] font-medium text-gray-400">{selected.helper}</span> : null}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open ? (
                <div className="absolute right-0 z-[70] mt-1 max-h-72 w-full min-w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-xl">
                    {options.map(option => {
                        const active = option.value === value
                        return (
                            <button
                                key={option.value || 'empty'}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                    onChange(option.value)
                                    setOpen(false)
                                }}
                                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm ${active ? 'bg-green-50 text-green-700' : 'text-gray-700 hover:bg-gray-50'}`}
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-semibold">{option.label}</span>
                                    {option.helper ? <span className="block truncate text-[11px] text-gray-400">{option.helper}</span> : null}
                                </span>
                                {active ? <Check className="h-4 w-4 shrink-0" /> : null}
                            </button>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}

function FieldValueInput({ field, meta, onChange }) {
    if (meta.type === 'textarea') {
        return (
            <textarea
                value={field.value}
                onChange={event => onChange(event.target.value)}
                className="field-input min-h-20 resize-y"
                placeholder={meta.placeholder || 'Value'}
            />
        )
    }

    return (
        <input
            value={field.value}
            type={meta.type || 'text'}
            onChange={event => onChange(event.target.value)}
            className="field-input"
            placeholder={meta.placeholder || 'Value'}
        />
    )
}

function BusinessDataCell({ fields }) {
    const visible = fields.slice(0, 4)
    const extra = Math.max(0, fields.length - visible.length)

    return (
        <div className="flex max-w-[420px] flex-wrap gap-1.5">
            {visible.map(([key, value]) => {
                const meta = FIELD_PRESET_BY_KEY[key] || { label: key }
                const Icon = getFieldIcon(key)
                return (
                    <div key={key} className="inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="shrink-0 font-medium text-gray-500">{meta.label}</span>
                        <span className="truncate font-semibold text-gray-900">{String(value)}</span>
                    </div>
                )
            })}
            {extra > 0 ? (
                <span className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-500">+{extra} more</span>
            ) : null}
        </div>
    )
}

function getFieldIcon(key) {
    if (['email'].includes(key)) return Mail
    if (['address', 'city', 'state', 'pincode'].includes(key)) return MapPin
    if (['invoice', 'form_id'].includes(key)) return FileText
    if (['amount', 'payment_status', 'due_date'].includes(key)) return CreditCard
    if (['plan', 'period', 'status', 'course', 'batch', 'admission_status'].includes(key)) return ClipboardList
    return Database
}
