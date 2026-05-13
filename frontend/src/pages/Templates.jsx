import { useState, useEffect } from 'react'
import { Plus, Search, Filter, MoreHorizontal, FileText, CheckCircle, Clock, XCircle, Image as ImageIcon, Video, Trash2, Link as LinkIcon, Phone } from 'lucide-react'
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

    const fetchData = async () => {
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
            }
        } catch (error) {
            console.error('Error fetching data:', error);
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

            {/* Grid */}
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
    const [step, setStep] = useState(1)
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

    // Submit handler
    const handleSubmit = async () => {
        setIsSubmitting(true)
        try {
            const formData = new FormData();
            formData.append('name', data.name);
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
                onClose();
            } else {
                alert(json.error || 'Failed to create template');
            }
        } catch(e) {
            console.error(e);
            alert('Error creating template');
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Message Template" maxWidth="max-w-4xl">
            <div className="flex gap-6 h-[600px]">
                {/* Left: Form */}
                <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                        <input
                            type="text"
                            className="w-full rounded-lg border-gray-300 text-sm"
                            placeholder="e.g. welcome_offer_v2"
                            value={data.name}
                            onChange={e => setData({ ...data, name: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                        />
                        <p className="text-xs text-gray-500 mt-1">Only lowercase letters, numbers, and underscores.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                            <select
                                className="w-full rounded-lg border-gray-300 text-sm"
                                value={data.category}
                                onChange={e => setData({ ...data, category: e.target.value })}
                            >
                                <option value="MARKETING">Marketing</option>
                                <option value="UTILITY">Utility</option>
                                <option value="AUTHENTICATION">Authentication</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                            <select
                                className="w-full rounded-lg border-gray-300 text-sm"
                                value={data.language}
                                onChange={e => setData({ ...data, language: e.target.value })}
                            >
                                <option value="en_US">English (US)</option>
                                <option value="es_ES">Spanish</option>
                                <option value="pt_BR">Portuguese</option>
                            </select>
                        </div>
                    </div>

                    <hr className="border-gray-200" />

                    {/* Header */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Header (Optional)</label>
                        <div className="flex gap-4 mb-3">
                            {['NONE', 'TEXT', 'IMAGE', 'VIDEO'].map(t => (
                                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="radio"
                                        checked={data.headerType === t}
                                        onChange={() => setData({ ...data, headerType: t })}
                                        className="text-green-600 focus:ring-green-500"
                                    />
                                    <span className="capitalize">{t.toLowerCase()}</span>
                                </label>
                            ))}
                        </div>
                        {data.headerType === 'TEXT' && (
                            <input
                                type="text"
                                className="w-full rounded-lg border-gray-300 text-sm"
                                placeholder="Enter header text..."
                                value={data.headerText}
                                onChange={e => setData({ ...data, headerText: e.target.value })}
                            />
                        )}
                        {(data.headerType === 'IMAGE' || data.headerType === 'VIDEO') && (
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-sm text-gray-500 relative bg-gray-50">
                                {file ? (
                                    <div className="flex flex-col items-center">
                                        <CheckCircle className="h-6 w-6 text-green-500 mb-1" />
                                        <span className="text-gray-900 font-medium truncate max-w-full">{file.name}</span>
                                        <button onClick={() => setFile(null)} className="text-red-500 text-xs mt-2 hover:underline relative z-10">Remove</button>
                                    </div>
                                ) : (
                                    <>
                                        {data.headerType === 'IMAGE' ? <ImageIcon className="h-6 w-6 mx-auto mb-2 text-gray-400" /> : <Video className="h-6 w-6 mx-auto mb-2 text-gray-400" />}
                                        <span className="text-indigo-600 font-medium hover:underline">Click to upload {data.headerType.toLowerCase()}</span>
                                        <span className="block text-xs mt-1">Required for approval</span>
                                        <input type="file" accept={data.headerType === 'IMAGE' ? "image/*" : "video/mp4"} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => setFile(e.target.files[0])} />
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Body */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Body Text</label>
                        <textarea
                            className="w-full rounded-lg border-gray-300 text-sm font-mono"
                            rows={6}
                            placeholder="Hello {{1}}, your order is ready!"
                            value={data.bodyText}
                            onChange={e => setData({ ...data, bodyText: e.target.value })}
                        />
                        <div className="flex justify-between items-center mt-1">
                            <button
                                type="button"
                                className="text-xs text-green-600 font-medium hover:underline"
                                onClick={() => {
                                    const matches = data.bodyText.match(/\{\{(\d+)\}\}/g);
                                    let nextNum = 1;
                                    if (matches) {
                                        const nums = matches.map(m => parseInt(m.replace(/[^0-9]/g, '')));
                                        nextNum = Math.max(...nums) + 1;
                                    }
                                    setData(prev => ({ ...prev, bodyText: prev.bodyText + (prev.bodyText ? ' ' : '') + `{{${nextNum}}}` }));
                                }}
                            >
                                + Add Variable
                            </button>
                            <span className="text-xs text-gray-400">{data.bodyText.length}/1024</span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Footer (Optional)</label>
                        <input
                            type="text"
                            className="w-full rounded-lg border-gray-300 text-sm"
                            placeholder="e.g. Reply STOP to unsubscribe"
                            value={data.footerText}
                            onChange={e => setData({ ...data, footerText: e.target.value })}
                        />
                    </div>

                    {/* Buttons */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Buttons (Optional)</label>
                        <div className="space-y-3">
                            {data.buttons.map((btn, i) => (
                                <div key={i} className="flex gap-2 items-start bg-gray-50 border border-gray-200 p-2 rounded-lg">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex gap-2">
                                            <select 
                                                className="text-sm border-gray-300 rounded-md shadow-sm w-32" 
                                                value={btn.type}
                                                onChange={e => {
                                                    const newType = e.target.value;
                                                    setData(prev => {
                                                        const newBtns = [...prev.buttons];
                                                        newBtns[i] = { ...newBtns[i], type: newType, url: '', phone_number: '' };
                                                        return { ...prev, buttons: newBtns };
                                                    });
                                                }}
                                            >
                                                <option value="QUICK_REPLY">Quick Reply</option>
                                                <option value="URL">Visit Website</option>
                                                <option value="PHONE_NUMBER">Call Phone</option>
                                            </select>
                                            <input
                                                placeholder="Button Text"
                                                value={btn.text}
                                                onChange={e => {
                                                    setData(prev => {
                                                        const newBtns = [...prev.buttons];
                                                        newBtns[i].text = e.target.value;
                                                        return { ...prev, buttons: newBtns };
                                                    });
                                                }}
                                                className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-sm"
                                            />
                                        </div>
                                        {btn.type === 'URL' && (
                                            <input 
                                                placeholder="https://example.com" 
                                                value={btn.url || ''} 
                                                onChange={e => setData(prev => {
                                                    const newBtns = [...prev.buttons];
                                                    newBtns[i].url = e.target.value;
                                                    return { ...prev, buttons: newBtns };
                                                })}
                                                className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm" 
                                            />
                                        )}
                                        {btn.type === 'PHONE_NUMBER' && (
                                            <div className="flex bg-white border border-gray-300 rounded overflow-hidden">
                                                <span className="px-2 py-1 bg-gray-100 text-gray-500 text-sm border-r border-gray-300">+</span>
                                                <input 
                                                    placeholder="1234567890" 
                                                    value={btn.phone_number || ''} 
                                                    onChange={e => setData(prev => {
                                                        const newBtns = [...prev.buttons];
                                                        newBtns[i].phone_number = `+${e.target.value.replace(/[^0-9]/g, '')}`;
                                                        return { ...prev, buttons: newBtns };
                                                    })}
                                                    className="w-full px-2 py-1 text-sm outline-none" 
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setData(prev => ({ ...prev, buttons: prev.buttons.filter((_, idx) => idx !== i) }))} className="mt-1">
                                        <XCircle className="h-5 w-5 text-red-400 hover:text-red-600" />
                                    </button>
                                </div>
                            ))}
                            {data.buttons.length < 3 && (
                                <button
                                    className="text-sm text-indigo-600 font-medium border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50"
                                    onClick={() => setData(prev => ({ ...prev, buttons: [...prev.buttons, { type: 'QUICK_REPLY', text: `Button ${prev.buttons.length + 1}`, url: '', phone_number: '' }] }))}
                                >
                                    + Add Button
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Preview */}
                <div className="w-[320px] bg-gray-100 rounded-2xl p-4 flex flex-col items-center">
                    <div className="w-full h-full bg-[#E5DDD5] rounded-xl overflow-hidden shadow-inner flex flex-col p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
                        <div className="bg-white rounded-lg p-3 pb-6 pr-12 shadow-sm rounded-tr-none max-w-[90%] self-start relative">
                            {/* Header Media */}
                            {data.headerType === 'TEXT' && data.headerText && (
                                <p className="font-bold text-gray-800 text-sm mb-2">{data.headerText}</p>
                            )}
                            {data.headerType === 'IMAGE' && (
                                file ? (
                                    <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-32 object-cover rounded mb-2 bg-gray-100" />
                                ) : (
                                    <div className="h-32 bg-gray-200 rounded mb-2 flex items-center justify-center text-gray-400">
                                        <ImageIcon className="h-8 w-8" />
                                    </div>
                                )
                            )}
                            {data.headerType === 'VIDEO' && (
                                file ? (
                                    <video src={URL.createObjectURL(file)} className="w-full h-32 object-cover rounded mb-2 bg-gray-100" controls muted />
                                ) : (
                                    <div className="h-32 bg-gray-200 rounded mb-2 flex items-center justify-center text-gray-400">
                                        <Video className="h-8 w-8" />
                                    </div>
                                )
                            )}

                            {/* Body */}
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                {data.bodyText || 'Start typing to preview...'}
                            </p>

                            {/* Footer */}
                            {data.footerText && <p className="text-[10px] text-gray-400 mt-1">{data.footerText}</p>}

                            {/* Time */}
                            <span className="text-[10px] text-gray-400 absolute bottom-1 right-2">10:00 AM</span>
                        </div>

                        {/* Buttons in Preview */}
                        {data.buttons.length > 0 && (
                            <div className="mt-2 space-y-1 w-[90%] self-start">
                                {data.buttons.map((btn, i) => (
                                    <div key={i} className="bg-white rounded text-center py-2 text-cyan-600 text-sm font-medium shadow-sm">
                                        {btn.text}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-sm disabled:opacity-50"
                    onClick={handleSubmit}
                >
                    {isSubmitting ? 'Submitting...' : 'Submit for Review'}
                </button>
            </div>
        </Modal>
    )
}
