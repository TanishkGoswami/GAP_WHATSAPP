import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, Filter, MoreHorizontal, FileText, CheckCircle, Clock, XCircle, Image as ImageIcon, Video, Trash2, Link as LinkIcon, Phone, AlertCircle, RefreshCw, UploadCloud, Type, MessageSquareText, MousePointerClick, ChevronDown, Loader2 } from 'lucide-react'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const DEMO_TEMPLATES = [
    { 
        id: 'demo-1', 
        name: 'welcome_promo', 
        category: 'MARKETING', 
        language: 'en_US', 
        status: 'APPROVED', 
        isDemo: true,
        components: [{ type: 'BODY', text: 'Hello {{1}}, welcome to GetAiPilot! 🚀 Enjoy 20% off your first order using code WELCOME20.' }]
    },
    { 
        id: 'demo-2', 
        name: 'shipping_update', 
        category: 'UTILITY', 
        language: 'en_US', 
        status: 'APPROVED', 
        isDemo: true,
        components: [{ type: 'BODY', text: 'Hi {{1}}, your order #{{2}} has just shipped. Track it here: {{3}}' }]
    },
    { 
        id: 'demo-3', 
        name: 'otp_verification', 
        category: 'AUTHENTICATION', 
        language: 'en_US', 
        status: 'PENDING', 
        isDemo: true,
        components: [{ type: 'BODY', text: 'Your verification code is {{1}}. Never share this code with anyone.' }]
    }
];

export default function Templates() {
    const { session, apiCall } = useAuth();
    const [iscreateOpen, setIsCreateOpen] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState(null)
    const [activeTab, setActiveTab] = useState('ALL') // ALL, MARKETING, UTILITY
    const [templates, setTemplates] = useState([])
    const [loading, setLoading] = useState(true)
    const [hasConnectedAccount, setHasConnectedAccount] = useState(false)
    const [fetchError, setFetchError] = useState('')

    const fetchData = async () => {
        setLoading(true)
        setFetchError('')
        try {
            // Check if account is connected
            const accRes = await apiCall(`${API_URL}/api/whatsapp/accounts`);
            if (accRes.ok) {
                const accounts = await accRes.json();
                setHasConnectedAccount(Array.isArray(accounts) && accounts.length > 0);
            }

            // Fetch templates
            const tplRes = await apiCall(`${API_URL}/api/whatsapp/templates`);
            const tplData = await tplRes.json();
            if (tplRes.ok) {
                setTemplates(tplData || []);
            } else {
                console.error('Error validating access token:', tplData.error);
                setFetchError(tplData.error || 'Could not load templates from Meta.')
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            setFetchError(error?.message || 'Could not load templates.')
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (session?.access_token) {
            fetchData();
        }
    }, [session])

    const handleDelete = async (name, isDemo) => {
        if(isDemo) {
            alert("This is a demo template for reference and cannot be deleted.");
            return;
        }
        if(!confirm(`Are you sure you want to delete template "${name}"?`)) return;
        try {
            const res = await apiCall(`${API_URL}/api/whatsapp/templates/${name}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchData();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete template');
            }
        } catch (error) {
            console.error(error);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your WhatsApp message templates</p>
                </div>
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                >
                    <Plus className="h-4 w-4" />
                    New Template
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 border-b border-gray-200 overflow-x-auto pb-1">
                {['ALL', 'MARKETING', 'UTILITY', 'AUTHENTICATION'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`text-sm font-medium px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === tab
                                ? 'border-green-500 text-green-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {tab === 'ALL' ? 'All Templates' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>

            {fetchError && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="font-medium">Templates could not be refreshed</div>
                        <div className="mt-0.5">{fetchError}</div>
                    </div>
                    <button onClick={fetchData} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                    </button>
                </div>
            )}

            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-56 animate-pulse rounded-xl border border-gray-200 bg-white p-5">
                            <div className="h-10 w-10 rounded-lg bg-gray-100" />
                            <div className="mt-5 h-4 w-36 rounded bg-gray-100" />
                            <div className="mt-3 h-16 rounded bg-gray-100" />
                            <div className="mt-5 h-3 w-full rounded bg-gray-100" />
                        </div>
                    ))}
                </div>
            )}

            {/* Grid */}
            {!loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...templates, ...(hasConnectedAccount ? [] : DEMO_TEMPLATES)].filter(t => activeTab === 'ALL' || t.category === activeTab).map((template) => (
                    <div 
                        key={template.id || template.name} 
                        onClick={() => setSelectedTemplate(template)}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-green-300 transition-all cursor-pointer relative"
                    >
                        <div className="absolute top-5 right-5 flex items-center gap-2">
                            {template.isDemo && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-wider">
                                    Demo
                                </span>
                            )}
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${template.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-100' :
                                    template.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                                        'bg-red-50 text-red-700 border-red-100'
                                }`}>
                                {template.status === 'APPROVED' && <CheckCircle className="h-3 w-3" />}
                                {template.status === 'PENDING' && <Clock className="h-3 w-3" />}
                                {template.status === 'REJECTED' && <XCircle className="h-3 w-3" />}
                                {template.status}
                            </span>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(template.name, template.isDemo); }} 
                                className="text-gray-400 hover:text-red-500 transition-colors" 
                                title="Delete template"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-medium text-gray-900">{template.name}</h3>
                                <p className="text-xs text-gray-500">{template.language}</p>
                            </div>
                        </div>

                        <div className="space-y-2 mb-4">
                            <div className="text-xs text-gray-400 uppercase font-semibold tracking-wider">Preview</div>
                            <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 line-clamp-3">
                                {template.components?.find((c) => c.type === 'BODY')?.text || 'No preview'}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                            <span>{template.category}</span>
                            <span>Updated {template.last_updated}</span>
                        </div>
                    </div>
                ))}

                {/* Add New Card Placeholder */}
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 p-8 text-center hover:border-green-500 hover:bg-green-50 transition-colors group"
                >
                    <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mb-3 group-hover:bg-green-100 group-hover:text-green-600 transition-colors">
                        <Plus className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-medium text-gray-900">Create New Template</h3>
                    <p className="text-xs text-gray-500 mt-1">Marketing, Utility, or Auth</p>
                </button>
            </div>
            )}

            <CreateTemplateModal isOpen={iscreateOpen} onClose={() => setIsCreateOpen(false)} onSuccess={fetchData} apiCall={apiCall} />
            <ViewTemplateModal template={selectedTemplate} onClose={() => setSelectedTemplate(null)} />
        </div>
    )
}

function ViewTemplateModal({ template, onClose }) {
    if (!template) return null;

    const headerComp = template.components?.find(c => c.type === 'HEADER');
    const bodyComp = template.components?.find(c => c.type === 'BODY');
    const footerComp = template.components?.find(c => c.type === 'FOOTER');
    const buttonsComp = template.components?.find(c => c.type === 'BUTTONS');
    const headerExample = headerComp?.example || {};
    const headerMediaUrl =
        headerComp?.media_url ||
        headerComp?.url ||
        headerComp?.link ||
        headerExample?.header_url?.[0] ||
        headerExample?.header_handle?.find?.((value) => String(value).startsWith('http'));

    return (
        <Modal isOpen={!!template} onClose={onClose} title={`View Template: ${template.name}`} maxWidth="max-w-md">
            <div className="bg-gray-100 rounded-2xl p-4 flex flex-col items-center">
                <div className="w-full h-full bg-[#E5DDD5] rounded-xl overflow-hidden shadow-inner flex flex-col p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
                    <div className="bg-white rounded-lg p-3 pb-6 pr-12 shadow-sm rounded-tr-none max-w-[90%] self-start relative">
                        {headerComp?.format === 'TEXT' && <p className="font-bold text-gray-800 text-sm mb-2">{headerComp.text}</p>}
                        {headerComp?.format === 'IMAGE' && (
                            headerMediaUrl ? (
                                <img src={headerMediaUrl} alt="Template header" className="w-full h-32 object-cover rounded mb-2 bg-gray-100" />
                            ) : (
                                <div className="h-32 bg-gray-200 rounded mb-2 flex flex-col items-center justify-center text-gray-400 text-center px-3">
                                    <ImageIcon className="h-8 w-8" />
                                    <span className="text-[10px] mt-1 tracking-wider uppercase">Image Header</span>
                                    <span className="text-[10px] mt-1 normal-case tracking-normal">Meta keeps this as approval sample. Add media when sending.</span>
                                </div>
                            )
                        )}
                        {headerComp?.format === 'VIDEO' && (
                            <div className="h-32 bg-gray-200 rounded mb-2 flex flex-col items-center justify-center text-gray-400">
                                <Video className="h-8 w-8" />
                                <span className="text-[10px] mt-1 tracking-wider uppercase">Video Attachment</span>
                            </div>
                        )}
                        
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {bodyComp?.text || ''}
                        </p>

                        {footerComp?.text && <p className="text-[10px] text-gray-400 mt-1">{footerComp.text}</p>}
                        <span className="text-[10px] text-gray-400 absolute bottom-1 right-2">10:00 AM</span>
                    </div>

                    {buttonsComp?.buttons?.length > 0 && (
                        <div className="mt-2 space-y-1 w-[90%] self-start">
                            {buttonsComp.buttons.map((btn, i) => (
                                <div key={i} className="bg-white rounded text-center py-2 text-cyan-600 text-sm font-medium shadow-sm truncate px-2">
                                    {btn.type === 'URL' && <LinkIcon className="inline w-3 h-3 mr-1" />}
                                    {btn.type === 'PHONE_NUMBER' && <Phone className="inline w-3 h-3 mr-1" />}
                                    {btn.text}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-4 pt-4 flex justify-end">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-900 shadow-sm">
                    Close View
                </button>
            </div>
        </Modal>
    )
}

function CreateTemplateModal({ isOpen, onClose, onSuccess, apiCall }) {
    const [data, setData] = useState({
        name: '',
        category: 'MARKETING',
        language: 'en_US',
        headerType: 'NONE', // NONE, IMAGE, TEXT, VIDEO
        headerText: '',
        bodyText: '',
        footerText: '',
        buttons: [] // { type: 'QUICK_REPLY', text: 'Yes', url: '', phone_number: '' }
    })
    const [file, setFile] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState('')

    const fieldClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/20 placeholder:text-gray-400'
    const selectClass = `${fieldClass} appearance-none pr-9`
    const normalizedName = data.name.trim()
    const bodyLength = data.bodyText.length
    const previewFileUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
    const canSubmit = normalizedName && /^[a-z0-9_]+$/.test(normalizedName) && data.bodyText.trim() && bodyLength <= 1024 && !(data.headerType === 'TEXT' && !data.headerText.trim()) && !((data.headerType === 'IMAGE' || data.headerType === 'VIDEO') && !file)

    useEffect(() => {
        return () => {
            if (previewFileUrl) URL.revokeObjectURL(previewFileUrl)
        }
    }, [previewFileUrl])

    const closeModal = () => {
        if (isSubmitting) return
        setSubmitError('')
        onClose()
    }

    const updateButton = (index, patch) => {
        setData(prev => {
            const buttons = [...prev.buttons]
            buttons[index] = { ...buttons[index], ...patch }
            return { ...prev, buttons }
        })
    }

    const addVariable = () => {
        const matches = data.bodyText.match(/\{\{(\d+)\}\}/g)
        const nextNum = matches ? Math.max(...matches.map(m => Number(m.replace(/[^0-9]/g, '')))) + 1 : 1
        setData(prev => ({ ...prev, bodyText: `${prev.bodyText}${prev.bodyText ? ' ' : ''}{{${nextNum}}}` }))
    }

    const addButton = () => {
        setData(prev => ({
            ...prev,
            buttons: [...prev.buttons, { type: 'QUICK_REPLY', text: `Button ${prev.buttons.length + 1}`, url: '', phone_number: '' }]
        }))
    }

    // Submit handler
    const handleSubmit = async () => {
        setSubmitError('')
        if (!canSubmit) {
            setSubmitError('Complete the required fields before submitting for review.')
            return
        }

        setIsSubmitting(true)
        try {
            const formData = new FormData();
            formData.append('name', normalizedName);
            formData.append('category', data.category);
            formData.append('language', data.language);

            const components = [];

            if (data.headerType !== 'NONE') {
                const headerComp = { type: 'HEADER', format: data.headerType };
                if (data.headerType === 'TEXT') {
                    headerComp.text = data.headerText;
                }
                components.push(headerComp);
            }

            if (data.bodyText) {
                components.push({ type: 'BODY', text: data.bodyText });
            }

            if (data.footerText) {
                components.push({ type: 'FOOTER', text: data.footerText });
            }

            if (data.buttons.length > 0) {
                components.push({
                    type: 'BUTTONS',
                    buttons: data.buttons.map(b => {
                        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
                        if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
                        return { type: 'QUICK_REPLY', text: b.text };
                    })
                });
            }

            formData.append('components', JSON.stringify(components));
            if (file && (data.headerType === 'IMAGE' || data.headerType === 'VIDEO')) {
                formData.append('file', file);
            }

            const res = await apiCall(`${API_URL}/api/whatsapp/templates`, {
                method: 'POST',
                body: formData
            });

            const json = await res.json();
            if (res.ok) {
                if (onSuccess) onSuccess();
                closeModal();
            } else {
                setSubmitError(json.error || 'Failed to create template');
            }
        } catch(e) {
            console.error(e);
            setSubmitError('Error creating template');
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <Modal isOpen={isOpen} onClose={closeModal} title="Create Message Template" maxWidth="max-w-5xl">
            <div className="grid max-h-[72vh] gap-6 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-h-0 overflow-y-auto pr-1">
                    {submitError ? (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{submitError}</span>
                        </div>
                    ) : null}

                    <div className="space-y-5">
                        <section className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-800">Template name</label>
                                <input
                                    type="text"
                                    className={`${fieldClass} ${normalizedName && !/^[a-z0-9_]+$/.test(normalizedName) ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                                    placeholder="welcome_offer_v2"
                                    value={data.name}
                                    onChange={e => setData({ ...data, name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                                />
                                <p className="mt-1.5 text-xs text-gray-500">Use lowercase letters, numbers, and underscores only.</p>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1.5 block text-sm font-semibold text-gray-800">Category</label>
                                    <div className="relative">
                                        <select className={selectClass} value={data.category} onChange={e => setData({ ...data, category: e.target.value })}>
                                            <option value="MARKETING">Marketing</option>
                                            <option value="UTILITY">Utility</option>
                                            <option value="AUTHENTICATION">Authentication</option>
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-semibold text-gray-800">Language</label>
                                    <div className="relative">
                                        <select className={selectClass} value={data.language} onChange={e => setData({ ...data, language: e.target.value })}>
                                            <option value="en_US">English (US)</option>
                                            <option value="es_ES">Spanish</option>
                                            <option value="pt_BR">Portuguese</option>
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="border-t border-gray-100 pt-5">
                            <div className="mb-3 flex items-center gap-2">
                                <Type className="h-4 w-4 text-gray-500" />
                                <h4 className="text-sm font-semibold text-gray-900">Header</h4>
                                <span className="text-xs text-gray-400">Optional</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {['NONE', 'TEXT', 'IMAGE', 'VIDEO'].map(t => {
                                    const Icon = t === 'IMAGE' ? ImageIcon : t === 'VIDEO' ? Video : Type
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => {
                                                setFile(null)
                                                setData({ ...data, headerType: t })
                                            }}
                                            className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition ${data.headerType === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            {t === 'NONE' ? null : <Icon className="h-4 w-4" />}
                                            {t.charAt(0) + t.slice(1).toLowerCase()}
                                        </button>
                                    )
                                })}
                            </div>

                            {data.headerType === 'TEXT' ? (
                                <input
                                    type="text"
                                    className={`${fieldClass} mt-3`}
                                    placeholder="Short headline for the message"
                                    value={data.headerText}
                                    onChange={e => setData({ ...data, headerText: e.target.value })}
                                />
                            ) : null}

                            {(data.headerType === 'IMAGE' || data.headerType === 'VIDEO') ? (
                                <div className="relative mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center transition hover:border-green-400 hover:bg-green-50/50">
                                    {file ? (
                                        <div className="flex items-center justify-between gap-3 text-left">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
                                                    <CheckCircle className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold text-gray-900">{file.name}</div>
                                                    <div className="text-xs text-gray-500">{Math.ceil(file.size / 1024)} KB selected</div>
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => setFile(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                                        </div>
                                    ) : (
                                        <>
                                            <UploadCloud className="mx-auto h-7 w-7 text-gray-400" />
                                            <div className="mt-2 text-sm font-semibold text-gray-800">Upload {data.headerType.toLowerCase()} sample</div>
                                            <div className="mt-1 text-xs text-gray-500">Required by Meta for media header approval.</div>
                                            <input type="file" accept={data.headerType === 'IMAGE' ? 'image/*' : 'video/mp4'} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={e => setFile(e.target.files?.[0] || null)} />
                                        </>
                                    )}
                                </div>
                            ) : null}
                        </section>

                        <section className="border-t border-gray-100 pt-5">
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                    <MessageSquareText className="h-4 w-4 text-gray-500" />
                                    Body text
                                </label>
                                <span className={`text-xs ${bodyLength > 1024 ? 'text-red-600' : 'text-gray-400'}`}>{bodyLength}/1024</span>
                            </div>
                            <textarea
                                className={`${fieldClass} min-h-32 resize-y font-mono leading-6`}
                                rows={5}
                                placeholder="Hello {{1}}, your order is ready!"
                                value={data.bodyText}
                                maxLength={1100}
                                onChange={e => setData({ ...data, bodyText: e.target.value })}
                            />
                            <div className="mt-2 flex items-center justify-between">
                                <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50" onClick={addVariable}>
                                    <Plus className="h-3.5 w-3.5" />
                                    Add variable
                                </button>
                                {!data.bodyText.trim() ? <span className="text-xs text-gray-500">Body is required.</span> : null}
                            </div>
                        </section>

                        <section className="space-y-4 border-t border-gray-100 pt-5">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-800">Footer <span className="font-normal text-gray-400">Optional</span></label>
                                <input className={fieldClass} placeholder="Reply STOP to unsubscribe" value={data.footerText} onChange={e => setData({ ...data, footerText: e.target.value })} />
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <MousePointerClick className="h-4 w-4 text-gray-500" />
                                        Buttons <span className="font-normal text-gray-400">Optional</span>
                                    </label>
                                    <span className="text-xs text-gray-400">{data.buttons.length}/3</span>
                                </div>
                                <div className="space-y-2">
                                    {data.buttons.map((btn, i) => (
                                        <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                            <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                                                <div className="relative">
                                                    <select
                                                        className={`${selectClass} py-2`}
                                                        value={btn.type}
                                                        onChange={e => updateButton(i, { type: e.target.value, url: '', phone_number: '' })}
                                                    >
                                                        <option value="QUICK_REPLY">Quick reply</option>
                                                        <option value="URL">Website</option>
                                                        <option value="PHONE_NUMBER">Phone</option>
                                                    </select>
                                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                                </div>
                                                <input className={`${fieldClass} py-2`} placeholder="Button text" value={btn.text} onChange={e => updateButton(i, { text: e.target.value })} />
                                                <button type="button" onClick={() => setData(prev => ({ ...prev, buttons: prev.buttons.filter((_, idx) => idx !== i) }))} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                            {btn.type === 'URL' ? (
                                                <input className={`${fieldClass} mt-2 py-2`} placeholder="https://example.com" value={btn.url || ''} onChange={e => updateButton(i, { url: e.target.value })} />
                                            ) : null}
                                            {btn.type === 'PHONE_NUMBER' ? (
                                                <input className={`${fieldClass} mt-2 py-2`} placeholder="+919999999999" value={btn.phone_number || ''} onChange={e => updateButton(i, { phone_number: `+${e.target.value.replace(/[^0-9]/g, '')}` })} />
                                            ) : null}
                                        </div>
                                    ))}
                                    {data.buttons.length < 3 ? (
                                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50" onClick={addButton}>
                                            <Plus className="h-4 w-4" />
                                            Add button
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <aside className="hidden min-h-0 rounded-2xl bg-gray-100 p-4 lg:block">
                    <div className="mb-3 flex items-center justify-between px-1">
                        <div className="text-sm font-semibold text-gray-800">Live preview</div>
                        <div className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500">WhatsApp</div>
                    </div>
                    <div className="h-[560px] max-h-[calc(72vh-42px)] rounded-xl bg-[#E5DDD5] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] p-4 shadow-inner">
                        <div className="relative max-h-full max-w-[92%] overflow-hidden rounded-lg rounded-tr-none bg-white p-3 pb-6 pr-10 text-sm shadow-sm">
                            {data.headerType === 'TEXT' && data.headerText ? <p className="mb-2 font-bold text-gray-900">{data.headerText}</p> : null}
                            {data.headerType === 'IMAGE' ? (
                                previewFileUrl ? <img src={previewFileUrl} alt="Preview" className="mb-2 h-36 w-full rounded object-cover bg-gray-100" /> : <div className="mb-2 flex h-36 items-center justify-center rounded bg-gray-100 text-gray-400"><ImageIcon className="h-8 w-8" /></div>
                            ) : null}
                            {data.headerType === 'VIDEO' ? (
                                previewFileUrl ? <video src={previewFileUrl} className="mb-2 h-36 w-full rounded object-cover bg-gray-100" controls muted /> : <div className="mb-2 flex h-36 items-center justify-center rounded bg-gray-100 text-gray-400"><Video className="h-8 w-8" /></div>
                            ) : null}
                            <p className="whitespace-pre-wrap break-words leading-5 text-gray-800">{data.bodyText || 'Start typing to preview...'}</p>
                            {data.footerText ? <p className="mt-2 text-[11px] text-gray-400">{data.footerText}</p> : null}
                            <span className="absolute bottom-1 right-2 text-[10px] text-gray-400">10:00 AM</span>
                        </div>
                        {data.buttons.length > 0 ? (
                            <div className="mt-2 max-w-[92%] space-y-1">
                                {data.buttons.map((btn, i) => (
                                    <div key={i} className="truncate rounded bg-white px-3 py-2 text-center text-sm font-medium text-cyan-600 shadow-sm">{btn.text || 'Button text'}</div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </aside>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
                <button
                    onClick={closeModal}
                    disabled={isSubmitting}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    disabled={isSubmitting || !canSubmit}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleSubmit}
                >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isSubmitting ? 'Submitting...' : 'Submit for review'}
                </button>
            </div>
        </Modal>
    )
}
