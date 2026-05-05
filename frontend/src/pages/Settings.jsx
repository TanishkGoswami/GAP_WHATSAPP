import { useState, useEffect } from 'react'
import { Save, Upload, FileText, Trash2, Bot, Database, Globe, Users, ShoppingBag, Key, Webhook, Copy, Check, Plus, User, Mail, Shield, ShieldCheck, UserPlus, X, Trash } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

export default function Settings() {
    const { session, userRole } = useAuth()
    const [activeTab, setActiveTab] = useState('knowledge_base')
    const [documents, setDocuments] = useState([
        { id: 1, name: 'Refund_Policy_v2.pdf', size: '2.4 MB', status: 'INDEXED', date: '2023-11-01' },
        { id: 2, name: 'Product_Catalog_2024.docx', size: '1.1 MB', status: 'INDEXED', date: '2023-11-15' },
        { id: 3, name: 'Support_Scripts.txt', size: '45 KB', status: 'PROCESSING', date: 'Just now' },
    ])

    const [members, setMembers] = useState([])
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'agent' })
    const [isInviting, setIsInviting] = useState(false)
    const [isLoadingMembers, setIsLoadingMembers] = useState(false)

    const handleDelete = (id) => {
        setDocuments(documents.filter(doc => doc.id !== id))
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
                setInviteForm({ name: '', email: '', role: 'agent' })
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
        <div className="max-w-6xl mx-auto flex gap-8">
            {/* Sidebar */}
            <div className="w-64 flex-shrink-0">
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
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm min-h-[600px]">
                {activeTab === 'knowledge_base' && (
                    <div className="p-8">
                        <div className="mb-8">
                            <h2 className="text-lg font-medium text-gray-900">Knowledge Base</h2>
                            <p className="text-sm text-gray-500">
                                Upload documents (PDF, DOCX, TXT) to train your AI agent. The AI will use this information to answer customer queries.
                            </p>
                        </div>

                        <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center mb-8 hover:bg-gray-50 transition-colors cursor-pointer">
                            <div className="mx-auto h-12 w-12 text-gray-400 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                                <Upload className="h-6 w-6" />
                            </div>
                            <h3 className="text-sm font-medium text-gray-900">Click to upload or drag and drop</h3>
                            <p className="text-xs text-gray-500 mt-1">PDF, DOCX, TXT up to 10MB</p>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-gray-700">Uploaded Documents ({documents.length})</h3>
                            {documents.map((doc) => (
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

                {activeTab !== 'knowledge_base' && activeTab !== 'integrations' && activeTab !== 'developer_api' && activeTab !== 'team_members' && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        Content for {activeTab.replace('_', ' ')} coming soon...
                    </div>
                )}
            </div>
        </div>
    )
}
