import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Filter, MoreHorizontal, Upload, Phone, Calendar, Tag, Edit2, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

export default function Contacts() {
    const { session, apiCall } = useAuth()
    const [selectedContact, setSelectedContact] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [tagFilter, setTagFilter] = useState('');
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newContact, setNewContact] = useState({ name: '', phone: '', tags: '' });
    const [importStatus, setImportStatus] = useState('');
    const fileInputRef = useRef(null);
    const [customNameDraft, setCustomNameDraft] = useState('')


    const isHumanContact = (c) => {
        const waId = String(c?.wa_id || '').trim().toLowerCase()
        if (!waId) return true
        if (waId === 'status@broadcast') return false
        if (waId.includes('@g.us')) return false // groups / communities
        if (waId.includes('@newsletter')) return false // channels
        // Any other JID types (e.g. newsletters, lid, etc) aren't a single human contact
        if (waId.includes('@') && !waId.endsWith('@s.whatsapp.net')) return false
        return true
    }

    const queryClient = useQueryClient()

    const { data: contactsData = [], isLoading: loading, error: contactsError } = useQuery({
        queryKey: ['contacts', session?.access_token],
        queryFn: async () => {
            if (!session?.access_token) return []
            const res = await apiCall(`${API_BASE}/contacts`)
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(`Failed to fetch contacts: ${res.status} ${body}`)
            }
            const data = await res.json()
            const rows = Array.isArray(data) ? data : []
            return rows.filter(isHumanContact)
        },
        staleTime: 1000 * 60 * 5, // 5 min cache
        enabled: !!session?.access_token
    })

    const contacts = contactsData;

    const mutation = useMutation({
        mutationFn: async (updatedContact) => {
            if (!session?.access_token) return
            const res = await apiCall(`${API_BASE}/contacts/${updatedContact.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ custom_name: customNameDraft }),
            })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(body || `Failed to save (HTTP ${res.status})`)
            }
            return res.json()
        },
        onSuccess: (updated) => {
            // Update the cache immediately
            queryClient.setQueryData(['contacts', session?.access_token], (old) => {
                return (old || []).map(c => c.id === updated.id ? { ...c, ...updated } : c)
            })
            setSelectedContact(prev => prev ? { ...prev, ...updated } : prev)
            // Also invalidate to be sure
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
        },
    })

    const saveCustomName = async () => {
        if (!selectedContact?.id) return
        mutation.mutate(selectedContact)
    }

    const isSavingName = mutation.isPending
    const saveNameError = mutation.error?.message || ''

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

        // Never display group/channel/internal identifiers as "phone"
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

    const getDisplayName = (c) => {
        const custom = String(c?.custom_name || '').trim()
        if (custom) return custom
        const rawName = String(c?.name || '').trim()
        // Reject digit-only names and provider identifiers
        if (rawName && !rawName.includes('@') && !/^\d+$/.test(rawName)) return rawName
        return formatPhoneForDisplay(c?.phone || c?.wa_id) || 'Unknown'
    }

    const getPhone = (c) => formatPhoneForDisplay(c?.phone || c?.wa_id) || ''

    const allTags = useMemo(() => {
        const tags = new Set()
        contacts.forEach((contact) => (contact.tags || []).forEach((tag) => tags.add(tag)))
        return Array.from(tags).sort()
    }, [contacts])

    const filteredContacts = contacts.filter(contact => {
        const matchesSearch =
            String(getDisplayName(contact)).toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(getPhone(contact)).includes(searchTerm) ||
            String(contact.wa_id || '').includes(searchTerm)
        const matchesTag = !tagFilter || (contact.tags || []).includes(tagFilter)
        return matchesSearch && matchesTag
    });

    const handleViewContact = (contact) => {
        setSelectedContact(contact);
        setCustomNameDraft(String(contact?.custom_name || ''))
        setShowProfileModal(true);
    };

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

    const createContact = async (payload) => {
        const res = await apiCall(`${API_BASE}/contacts`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
        if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Failed to create contact (${res.status})`)
        }
        return res.json()
    }

    const handleAddContact = async (e) => {
        e.preventDefault()
        try {
            await createContact(newContact)
            setShowAddModal(false)
            setNewContact({ name: '', phone: '', tags: '' })
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
        } catch (err) {
            alert(err.message)
        }
    }

    const handleImportCsv = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return

        try {
            setImportStatus('Importing CSV...')
            const text = await file.text()
            const lines = text.split(/\r?\n/).filter((line) => line.trim())
            if (lines.length < 2) throw new Error('CSV must include a header row and at least one contact')

            const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
            const nameIdx = headers.findIndex((h) => h.includes('name'))
            const phoneIdx = headers.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('number'))
            const tagsIdx = headers.findIndex((h) => h.includes('tag'))
            if (phoneIdx === -1) throw new Error('CSV needs a phone/mobile/number column')

            let imported = 0
            let failed = 0
            for (const line of lines.slice(1)) {
                const cols = parseCsvLine(line)
                const phone = cols[phoneIdx]
                if (!phone) continue
                try {
                    await createContact({
                        name: nameIdx >= 0 ? cols[nameIdx] : '',
                        phone,
                        tags: tagsIdx >= 0 ? cols[tagsIdx] : ''
                    })
                    imported++
                } catch {
                    failed++
                }
            }

            setImportStatus(`Imported ${imported} contact${imported === 1 ? '' : 's'}${failed ? `, skipped ${failed}` : ''}.`)
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
        } catch (err) {
            setImportStatus('')
            alert(err.message)
        }
    }

    const handleDeleteContact = async () => {
        if (!selectedContact?.id) return
        if (!confirm(`Delete ${getDisplayName(selectedContact)}?`)) return
        try {
            const res = await apiCall(`${API_BASE}/contacts/${selectedContact.id}`, { method: 'DELETE' })
            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                throw new Error(body.error || 'Failed to delete contact')
            }
            setShowProfileModal(false)
            setSelectedContact(null)
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
        } catch (err) {
            alert(err.message)
        }
    }

    return (
        <div className="space-y-6">            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your audience and customer data</p>
                </div>
                <div className="flex items-center gap-3">
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
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        <Upload className="h-4 w-4" />
                        Import CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-100"
                    >
                        <Plus className="h-4 w-4" />
                        Add Contact
                    </button>
                </div>
            </div>

            {importStatus && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                    {importStatus}
                </div>
            )}

            {mutation.error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-3">
                    <span className="font-bold">Error:</span> {mutation.error.message}
                </div>
            )}

            {/* Error State for Fetch */}
            {contactsError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <span className="font-bold">Failed to load contacts:</span>
                        <span>{contactsError.message}</span>
                    </div>
                    <button 
                        onClick={() => queryClient.invalidateQueries({ queryKey: ['contacts'] })}
                        className="text-xs font-bold underline text-red-800 hover:text-red-900 w-fit"
                    >
                        Try Again
                    </button>
                </div>
            )}

            {/* Filters & Search */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search contacts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-all"
                    />
                </div>
                <select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white font-medium outline-none focus:ring-2 focus:ring-green-500"
                >
                    <option value="">All tags</option>
                    {allTags.map((tag) => (
                        <option key={tag} value={tag}>{tag}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={() => {
                        setSearchTerm('')
                        setTagFilter('')
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                    <Filter className="h-4 w-4" />
                    Reset
                </button>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">Phone</th>
                                <th className="px-6 py-4">Tags</th>
                                <th className="px-6 py-4">Joined Date</th>
                                <th className="px-6 py-4">Last Active</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredContacts.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                                        No contacts found. Try adjusting your search.
                                    </td>
                                </tr>
                            ) : (
                                filteredContacts.map((contact) => (
                                    <tr
                                        key={contact.id}
                                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                                        onClick={() => handleViewContact(contact)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white flex items-center justify-center font-bold text-lg shadow-md">
                                                    {String(getDisplayName(contact)).charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-gray-900">{getDisplayName(contact)}</div>
                                                    <div className="text-xs text-gray-500 font-mono">{contact.wa_id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1 text-gray-700 font-mono text-xs">
                                                <Phone className="h-3 w-3 text-gray-400" />
                                                {getPhone(contact)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {(contact.tags || []).map(tag => (
                                                    <span key={tag} className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">
                                            <div className="flex items-center gap-1 text-xs">
                                                <Calendar className="h-3 w-3 text-gray-400" />
                                                {contact.created_at ? format(new Date(contact.created_at), 'MMM d, yyyy') : '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">
                                            <div className="text-xs">
                                                {contact.last_active ? format(new Date(contact.last_active), 'MMM d, yyyy • h:mm a') : '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleViewContact(contact);
                                                }}
                                                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                                            >
                                                <MoreHorizontal className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                        Showing <span className="font-medium">{filteredContacts.length}</span> of <span className="font-medium">{contacts.length}</span> contacts
                    </div>
                    <div className="flex gap-2">
                        <button className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" disabled>
                            Previous
                        </button>
                        <button className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" disabled>
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* Contact Profile Modal */}
            {showProfileModal && selectedContact && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 text-white flex items-center justify-center font-bold text-2xl shadow-lg">
                                    {String(getDisplayName(selectedContact)).charAt(0)}
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">{getDisplayName(selectedContact)}</h2>
                                    <p className="text-sm text-gray-500 font-mono mt-1">{selectedContact.wa_id}</p>
                                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                        <Phone className="h-3 w-3" />
                                        {getPhone(selectedContact)}
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowProfileModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Edit2 className="h-4 w-4" /> Your name (alias)
                                </h3>
                                <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
                                    <input
                                        value={customNameDraft}
                                        onChange={(e) => setCustomNameDraft(e.target.value)}
                                        placeholder="Type a name you want to see in chat"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                    />
                                    {saveNameError ? (
                                        <div className="text-xs text-red-600">{saveNameError}</div>
                                    ) : null}
                                    <div className="flex justify-end">
                                        <button
                                            onClick={saveCustomName}
                                            disabled={isSavingName}
                                            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                                        >
                                            {isSavingName ? 'Saving...' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Tag className="h-4 w-4" />
                                    Tags
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {(selectedContact.tags || []).length === 0 ? (
                                        <span className="text-sm text-gray-500">No tags</span>
                                    ) : (
                                        (selectedContact.tags || []).map(tag => (
                                            <span key={tag} className="px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                                {tag}
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="text-xs text-gray-500 mb-1">WhatsApp ID</div>
                                    <div className="font-medium text-gray-900 font-mono break-all">{selectedContact.wa_id || '-'}</div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="text-xs text-gray-500 mb-1">Joined</div>
                                    <div className="font-medium text-gray-900">
                                        {selectedContact.created_at ? format(new Date(selectedContact.created_at), 'MMM d, yyyy') : '-'}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="text-xs text-gray-500 mb-1">Last Active</div>
                                    <div className="font-medium text-gray-900">
                                        {selectedContact.last_active ? format(new Date(selectedContact.last_active), 'MMM d, yyyy • h:mm a') : '-'}
                                    </div>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <div className="text-xs text-gray-500 mb-1">Phone</div>
                                    <div className="font-medium text-gray-900 font-mono break-all">{getPhone(selectedContact) || '-'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={saveCustomName}
                                disabled={isSavingName}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                            >
                                <Edit2 className="h-4 w-4" />
                                {isSavingName ? 'Saving...' : 'Save alias'}
                            </button>
                            <button
                                onClick={handleDeleteContact}
                                className="px-4 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <form onSubmit={handleAddContact} className="bg-white rounded-xl max-w-md w-full shadow-xl">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-lg font-bold text-gray-900">Add Contact</h2>
                            <p className="text-sm text-gray-500 mt-1">Use a WhatsApp number with country code, or a 10 digit India number.</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                <input
                                    value={newContact.name}
                                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                    placeholder="Customer name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                <input
                                    required
                                    value={newContact.phone}
                                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                    placeholder="+91 98765 43210"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                                <input
                                    value={newContact.tags}
                                    onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                                    placeholder="lead, vip"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700"
                            >
                                Add Contact
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    )
}
