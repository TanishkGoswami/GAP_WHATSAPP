import { useState } from 'react'
import { Save, Upload, FileText, Trash2, Bot, Database, Globe, Users, ShoppingBag, Key, Webhook, Copy, Check } from 'lucide-react'

export default function Settings() {
    const [activeTab, setActiveTab] = useState('knowledge_base')
    const [documents, setDocuments] = useState([
        { id: 1, name: 'Refund_Policy_v2.pdf', size: '2.4 MB', status: 'INDEXED', date: '2023-11-01' },
        { id: 2, name: 'Product_Catalog_2024.docx', size: '1.1 MB', status: 'INDEXED', date: '2023-11-15' },
        { id: 3, name: 'Support_Scripts.txt', size: '45 KB', status: 'PROCESSING', date: 'Just now' },
    ])

    const handleDelete = (id) => {
        setDocuments(documents.filter(doc => doc.id !== id))
    }

    const [apiKey, setApiKey] = useState('sk_live_51M...')
    const [copied, setCopied] = useState(false)

    const copyToClipboard = () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="max-w-6xl mx-auto flex gap-8">
            {/* Sidebar */}
            <div className="w-64 flex-shrink-0">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
                <nav className="space-y-1">
                    {['General', 'Knowledge Base', 'Integrations', 'Team Members', 'Developer API'].map((tab) => {
                        const id = tab.toLowerCase().replace(' ', '_')
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

                {activeTab !== 'knowledge_base' && activeTab !== 'integrations' && activeTab !== 'developer_api' && (
                    <div className="flex items-center justify-center h-full text-gray-400">
                        Content for {activeTab.replace('_', ' ')} coming soon...
                    </div>
                )}
            </div>
        </div>
    )
}
