import React, { useState, useEffect } from 'react'
import { Send, Users, FileText, Calendar, Check, ArrowRight, LayoutGrid, Loader2, Clock, Trash2, ChevronDown, ChevronUp, Upload, Link as LinkIcon, Info } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'

const STEPS = [
    { id: 1, name: 'Details', icon: LayoutGrid },
    { id: 2, name: 'Audience', icon: Users },
    { id: 3, name: 'Content', icon: FileText },
    { id: 4, name: 'Review', icon: Check },
]

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

function parseVars(components) {
    const body = components?.find(c => c.type === 'BODY')?.text || ''
    const vars = []
    const seen = new Set()
    for (const match of body.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
        const key = String(match[1] || '').trim()
        if (!key || seen.has(key)) continue
        seen.add(key)
        vars.push({
            key,
            token: `{{${key}}}`,
            label: /^\d+$/.test(key) ? `Variable {{${key}}}` : key.replace(/[_-]/g, ' ')
        })
    }
    return vars
}

function getTemplateComponentSummary(components = []) {
    const header = components.find(c => c.type === 'HEADER')
    const buttons = components.find(c => c.type === 'BUTTONS')?.buttons || []
    const parts = []
    if (header?.format) parts.push(`${String(header.format).toLowerCase()} header`)
    if (buttons.length) parts.push(`${buttons.length} button${buttons.length > 1 ? 's' : ''}`)
    return parts.length ? parts.join(' · ') : 'Body only'
}

function cleanTemplateMapping(mapping = {}) {
    return Object.fromEntries(
        Object.entries(mapping).filter(([key]) => (
            !key.startsWith('_header_') &&
            !key.startsWith('header_media_') &&
            !key.startsWith('_button_url_') &&
            !key.startsWith('button_url_') &&
            !key.startsWith('_template_')
        ))
    )
}

function parseDynamicUrlButtons(components) {
    const buttons = components?.find(c => c.type === 'BUTTONS')?.buttons || []
    return buttons
        .map((button, index) => ({
            index,
            text: button.text || `Button ${index + 1}`,
            url: button.url || ''
        }))
        .filter(button => String(button.url).includes('{{'))
}

function normalizeDynamicUrlButtonValue(button, value) {
    let cleanValue = String(value || '').trim()
    const templateUrl = String(button?.url || '')
    const placeholderIndex = templateUrl.indexOf('{{')
    const staticPrefix = placeholderIndex >= 0 ? templateUrl.slice(0, placeholderIndex) : ''

    if (staticPrefix && cleanValue.startsWith(staticPrefix)) {
        cleanValue = cleanValue.slice(staticPrefix.length)
    }

    if (staticPrefix.endsWith('/') && cleanValue.startsWith('/')) {
        cleanValue = cleanValue.slice(1)
    }

    return cleanValue
}

function validateDynamicUrlButtonValue(button, value) {
    const rawValue = String(value || '').trim()
    const templateUrl = String(button?.url || '')
    const placeholderIndex = templateUrl.indexOf('{{')
    const staticPrefix = placeholderIndex >= 0 ? templateUrl.slice(0, placeholderIndex) : ''
    const normalizedValue = normalizeDynamicUrlButtonValue(button, rawValue)
    const isAbsoluteUrl = /^https?:\/\//i.test(rawValue)

    if (staticPrefix && isAbsoluteUrl && !rawValue.startsWith(staticPrefix)) {
        return {
            ok: false,
            value: normalizedValue,
            message: `Button "${button.text}" is approved for ${staticPrefix}... Enter only the placeholder part for that approved URL, or create a new Meta template for this different domain.`
        }
    }

    if (staticPrefix && /^https?:\/\//i.test(normalizedValue)) {
        return {
            ok: false,
            value: normalizedValue,
            message: `Button "${button.text}" needs only the URL placeholder value, not a full URL.`
        }
    }

    return {
        ok: !!normalizedValue,
        value: normalizedValue,
        message: `Button "${button.text}" needs the dynamic part of the URL, not the full approved URL. Example: ads, contact, or ?utm_source=whatsapp`
    }
}

export default function Broadcast() {
    const { session, apiCall } = useAuth()
    const token = session?.access_token

    const [activeTab, setActiveTab] = useState('new') // 'new' | 'history'
    const [campaignsList, setCampaignsList] = useState([])
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [expandedCampaignId, setExpandedCampaignId] = useState(null)

    const [currentStep, setCurrentStep] = useState(1)
    const [campaign, setCampaign] = useState({
        name: '',
        wa_account_id: '',
        scheduled_at: '',
        audience_tag: '', 
        template_name: '',
        template_language: 'en_US',
        variable_mapping: {} 
    })
    const [customTexts, setCustomTexts] = useState({})
    const [csvData, setCsvData] = useState(null)
    const [csvFileName, setCsvFileName] = useState('')

    const [waAccounts, setWaAccounts] = useState([])
    const [tags, setTags] = useState([])
    const [contacts, setContacts] = useState([])
    const [templates, setTemplates] = useState([])

    const [isLoading, setIsLoading] = useState({ accounts: true, tags: true, templates: true, contacts: false })
    const [isSending, setIsSending] = useState(false)
    const [sendResult, setSendResult] = useState(null)

    const selectedTemplate = templates.find(t => t.name === campaign.template_name && t.language === campaign.template_language)
        || templates.find(t => t.name === campaign.template_name)
    const variables = selectedTemplate ? parseVars(selectedTemplate.components) : []
    const dynamicUrlButtons = selectedTemplate ? parseDynamicUrlButtons(selectedTemplate.components) : []
    const selectedHeader = selectedTemplate?.components?.find(c => c.type === 'HEADER')
    const selectedHeaderFormat = String(selectedHeader?.format || '').toUpperCase()
    const needsHeaderMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedHeaderFormat)
    const [headerMediaUrl, setHeaderMediaUrl] = useState('')
    const [isHeaderUploading, setIsHeaderUploading] = useState(false)
    
    const filteredContacts = campaign.audience_tag === 'CSV_UPLOAD'
        ? (csvData || [])
        : campaign.audience_tag 
            ? contacts.filter(c => Array.isArray(c.tags) && c.tags.includes(campaign.audience_tag))
            : contacts;

    useEffect(() => {
        if (!token) return;

        apiCall(`${API_URL}/api/whatsapp/accounts`)
            .then(res => res.json())
            .then(data => { setWaAccounts(Array.isArray(data) ? data : []); setIsLoading(p => ({ ...p, accounts: false })) })
            .catch(() => setIsLoading(p => ({ ...p, accounts: false })));

        apiCall(`${API_URL}/api/broadcast/tags`)
            .then(res => res.json())
            .then(data => { setTags(data?.tags || []); setIsLoading(p => ({ ...p, tags: false })) })
            .catch(() => setIsLoading(p => ({ ...p, tags: false })));

        apiCall(`${API_URL}/api/whatsapp/templates`)
            .then(res => res.json())
            .then(data => { setTemplates(Array.isArray(data) ? data : []); setIsLoading(p => ({ ...p, templates: false })) })
            .catch(() => setIsLoading(p => ({ ...p, templates: false })));

        setIsLoading(p => ({ ...p, contacts: true }));
        apiCall(`${API_URL}/api/contacts`)
            .then(res => res.json())
            .then(data => { 
                const individuals = (data?.contacts || data || []).filter(c => c.contact_type === 'individual');
                setContacts(individuals); 
                setIsLoading(p => ({ ...p, contacts: false }));
            })
            .catch(() => setIsLoading(p => ({ ...p, contacts: false })));
    }, [token]);

    const fetchCampaignHistory = (silent = false) => {
        if (!silent) setIsLoadingHistory(true);
        apiCall(`${API_URL}/api/broadcast/campaigns`)
            .then(res => res.json())
            .then(data => {
                setCampaignsList(data.campaigns || []);
            })
            .catch(console.error)
            .finally(() => {
                if (!silent) setIsLoadingHistory(false);
            });
    }

    useEffect(() => {
        let interval;
        if (activeTab === 'history' && token) {
            fetchCampaignHistory(false);
            // Auto-refresh history every 5 seconds to show real-time status updates (Processing -> Completed)
            interval = setInterval(() => {
                fetchCampaignHistory(true);
            }, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        }
    }, [activeTab, token]);

    const deleteCampaign = async (id) => {
        if (!window.confirm('Are you sure you want to cancel and delete this scheduled campaign?')) return;
        try {
            const res = await apiCall(`${API_URL}/api/broadcast/campaigns/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchCampaignHistory();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete');
            }
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setCsvFileName(file.name);
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) {
                alert('CSV is empty');
                return;
            }
            
            const headers = lines[0].split(',').map(h => h.toLowerCase().trim());
            const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('number'));
            const nameIdx = headers.findIndex(h => h.includes('name'));
            
            if (phoneIdx === -1) {
                alert('CSV must contain a column for phone numbers (e.g. "Phone" or "Number")');
                return;
            }
            
            const parsed = [];
            for (let i = 1; i < lines.length; i++) {
                // simple split by comma, ignoring quotes for basic usage
                const cols = lines[i].split(',');
                if (cols[phoneIdx]) {
                    parsed.push({
                        phone: cols[phoneIdx].trim(),
                        name: nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx].trim() : 'Unknown'
                    });
                }
            }
            setCsvData(parsed);
        };
        reader.readAsText(file);
    };

    const handleVariableMapChange = (varNum, value) => {
        setCampaign(prev => ({
            ...prev,
            variable_mapping: { ...prev.variable_mapping, [varNum]: value }
        }));
    };

    const validateHeaderMediaUrl = () => {
        if (!needsHeaderMedia) return true
        const url = headerMediaUrl.trim()
        if (!url) {
            alert(`This template has a ${selectedHeaderFormat.toLowerCase()} header. Upload media or paste a public URL before sending.`)
            return false
        }
        if (!/^https?:\/\/.+\..+/.test(url)) {
            alert('Header media URL must be a public http/https URL.')
            return false
        }
        if (/^https?:\/\/example\.com\//i.test(url)) {
            alert('Please replace the example URL with your actual public media URL.')
            return false
        }
        return true
    }

    const syncHeaderMediaUrl = (url) => {
        const cleanUrl = String(url || '').trim()
        const mediaType = selectedHeaderFormat?.toLowerCase() || 'image'
        setHeaderMediaUrl(cleanUrl)
        setCampaign(prev => ({
            ...prev,
            variable_mapping: {
                ...prev.variable_mapping,
                _header_media_type: mediaType,
                _header_media_url: cleanUrl,
                header_media_type: mediaType,
                header_media_url: cleanUrl
            }
        }))
    }

    const handleButtonUrlParamChange = (buttonIndex, value) => {
        const button = dynamicUrlButtons.find(item => item.index === buttonIndex)
        const cleanValue = normalizeDynamicUrlButtonValue(button, value)
        setCampaign(prev => ({
            ...prev,
            variable_mapping: {
                ...prev.variable_mapping,
                [`_button_url_${buttonIndex}`]: cleanValue,
                [`button_url_${buttonIndex}`]: cleanValue
            }
        }))
    }

    const handleHeaderMediaUpload = async (file) => {
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        setIsHeaderUploading(true)
        try {
            const res = await apiCall(`${API_URL}/api/broadcast/header-media`, {
                method: 'POST',
                body: formData
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to upload header media')
            syncHeaderMediaUrl(data.publicUrl || '')
        } catch (err) {
            alert(err.message)
        } finally {
            setIsHeaderUploading(false)
        }
    }

    const handleNext = () => {
        if (currentStep === 1) {
            if (!campaign.name || !campaign.wa_account_id) return alert('Campaign Name and WA Account are required.');
        }
        if (currentStep === 2) {
            if (campaign.audience_tag === 'CSV_UPLOAD' && (!csvData || csvData.length === 0)) {
                return alert('Please upload a valid CSV file with contacts.');
            }
            if (filteredContacts.length === 0) return alert('No contacts selected in audience.');
        }
        if (currentStep === 3) {
            if (!campaign.template_name) return alert('Please select a template.');
            if (!validateHeaderMediaUrl()) return;
            for (const button of dynamicUrlButtons) {
                const validation = validateDynamicUrlButtonValue(button, campaign.variable_mapping[`_button_url_${button.index}`] || campaign.variable_mapping[`button_url_${button.index}`])
                if (!validation.ok) {
                    return alert(validation.message);
                }
            }
            for (let variable of variables) {
                const key = variable.key
                if (!campaign.variable_mapping[key] && !customTexts[key]) {
                    return alert(`Please map ${variable.token}.`);
                }
            }
        }
        setCurrentStep(p => Math.min(4, p + 1))
    };
    
    const handleBack = () => setCurrentStep(p => Math.max(1, p - 1));

    const handleLaunch = async () => {
        if (!validateHeaderMediaUrl()) return;
        setIsSending(true);
        setSendResult(null);

        const finalMapping = { ...campaign.variable_mapping };
        finalMapping._template_variables = variables.map(variable => variable.key);
        variables.forEach(variable => {
            const key = variable.key
            if (finalMapping[key] === 'custom') {
                finalMapping[key] = customTexts[key] || '';
            }
        });
        finalMapping._template_body = selectedTemplate?.components?.find(c => c.type === 'BODY')?.text || `[Template: ${campaign.template_name}]`;
        if (needsHeaderMedia) {
            finalMapping._header_media_type = selectedHeaderFormat.toLowerCase();
            finalMapping._header_media_url = headerMediaUrl.trim();
            finalMapping.header_media_type = selectedHeaderFormat.toLowerCase();
            finalMapping.header_media_url = headerMediaUrl.trim();
        }
        dynamicUrlButtons.forEach(button => {
            const value = validateDynamicUrlButtonValue(button, finalMapping[`_button_url_${button.index}`] || finalMapping[`button_url_${button.index}`]).value;
            finalMapping[`_button_url_${button.index}`] = value;
            finalMapping[`button_url_${button.index}`] = value;
        });

        let formattedScheduledAt = null;
        if (campaign.scheduled_at) {
            formattedScheduledAt = new Date(campaign.scheduled_at).toISOString();
        }

        const payload = {
            ...campaign,
            scheduled_at: formattedScheduledAt,
            audience_tag: campaign.audience_tag === 'CSV_UPLOAD' ? null : campaign.audience_tag,
            csv_data: campaign.audience_tag === 'CSV_UPLOAD' ? csvData : null,
            variable_mapping: finalMapping,
            required_header_type: needsHeaderMedia ? selectedHeaderFormat.toLowerCase() : undefined,
            header_media_type: needsHeaderMedia ? selectedHeaderFormat.toLowerCase() : undefined,
            header_media_url: needsHeaderMedia ? headerMediaUrl.trim() : undefined
        };

        try {
            const res = await apiCall(`${API_URL}/api/broadcast/send`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                setSendResult(data);
            } else {
                alert(data.error || 'Broadcast failed');
            }
        } catch (e) {
            alert('Error launching broadcast: ' + e.message);
        } finally {
            setIsSending(false);
        }
    };

    const startNew = () => {
        setSendResult(null);
        setCurrentStep(1);
        setCsvData(null);
        setCsvFileName('');
        setCampaign({
            ...campaign,
            name: '',
            scheduled_at: '',
            audience_tag: '',
            template_name: '',
            variable_mapping: {}
        });
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-12">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Broadcasts</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage and schedule bulk messages</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('new')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'new' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        New Campaign
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'history' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        History
                    </button>
                </div>
            </div>

            {activeTab === 'history' ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                        <h2 className="text-lg font-medium text-gray-900">Campaign History</h2>
                        <button onClick={fetchCampaignHistory} className="text-sm text-indigo-600 font-medium hover:text-indigo-800 flex items-center gap-1">
                            <Loader2 className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>
                    {isLoadingHistory && campaignsList.length === 0 ? (
                        <div className="p-12 text-center text-gray-500 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500"/></div>
                    ) : campaignsList.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            No campaigns found. Schedule your first broadcast!
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 font-medium uppercase text-xs">
                                <tr>
                                    <th className="px-6 py-4">Campaign Name</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Audience</th>
                                    <th className="px-6 py-4">Date / Scheduled</th>
                                    <th className="px-6 py-4">Performance</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {campaignsList.map(camp => (
                                    <React.Fragment key={camp.id}>
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900">{camp.name}</div>
                                                <div className="text-xs text-gray-500">{camp.template_name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                                                    camp.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                    camp.status === 'failed' ? 'bg-red-100 text-red-700' :
                                                    camp.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                    {camp.status.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">
                                                {camp.audience_tag || (camp.csv_data ? 'CSV Upload' : 'All Contacts')}
                                            </td>
                                            <td className="px-6 py-4 text-gray-500">
                                                {camp.scheduled_at ? format(new Date(camp.scheduled_at), 'PPp') : format(new Date(camp.created_at), 'PPp')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {camp.status === 'completed' ? (
                                                    <div className="flex gap-3 text-xs items-center">
                                                        <span className="text-green-600 font-medium bg-green-50 px-2 py-1 rounded">✅ {camp.sent_count}</span>
                                                        <span className="text-red-600 font-medium bg-red-50 px-2 py-1 rounded">❌ {camp.failed_count}</span>
                                                    </div>
                                                ) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 items-center">
                                                    {camp.status === 'scheduled' && (
                                                        <button 
                                                            onClick={() => deleteCampaign(camp.id)}
                                                            className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-50"
                                                            title="Cancel Scheduled Campaign"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {camp.status === 'completed' && camp.results && camp.results.length > 0 && (
                                                        <button 
                                                            onClick={() => setExpandedCampaignId(expandedCampaignId === camp.id ? null : camp.id)}
                                                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium flex items-center gap-1"
                                                        >
                                                            {expandedCampaignId === camp.id ? 'Hide Details' : 'View Results'}
                                                            {expandedCampaignId === camp.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedCampaignId === camp.id && camp.results && (
                                            <tr>
                                                <td colSpan="6" className="bg-gray-50 p-6 border-b border-gray-200 shadow-inner">
                                                    <h4 className="text-sm font-bold text-gray-900 mb-3">Detailed Delivery Results</h4>
                                                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                                                        {camp.results.map((res, idx) => (
                                                            <div key={idx} className="grid grid-cols-[1fr_auto] gap-4 text-xs p-3 bg-white rounded shadow-sm border border-gray-100">
                                                                <div className="flex min-w-0 items-center gap-3">
                                                                    <div className={`w-2 h-2 rounded-full ${res.status === 'sent' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                                    <span className="font-semibold text-gray-800">{res.name}</span> 
                                                                    <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{res.phone || 'Unknown Phone'}</span>
                                                                </div>
                                                                {res.status === 'sent' ? (
                                                                    <span className="text-green-600 font-medium">Delivered successfully</span>
                                                                ) : (
                                                                    <span className="max-w-xl whitespace-normal break-words text-right font-medium text-red-600" title={res.error}>
                                                                        Failed: {res.error}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            ) : sendResult ? (
                <div className="max-w-2xl mx-auto mt-12 bg-white rounded-xl shadow-sm p-8 text-center space-y-6">
                    <div className={`mx-auto h-20 w-20 rounded-full flex items-center justify-center ${sendResult.status === 'scheduled' ? 'bg-yellow-100 text-yellow-600' : 'bg-green-100 text-green-600'}`}>
                        {sendResult.status === 'scheduled' ? <Clock className="h-10 w-10" /> : <Check className="h-10 w-10" />}
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900">
                        {sendResult.status === 'scheduled' ? 'Campaign Scheduled!' : 'Campaign Launched!'}
                    </h2>
                    <p className="text-gray-500">
                        {sendResult.status === 'scheduled' 
                            ? `It will automatically run at ${format(new Date(campaign.scheduled_at), 'PPp')}.`
                            : 'Your messages are currently being processed in the background.'}
                    </p>
                    <div className="flex justify-center gap-4 mt-6">
                        <button 
                            onClick={startNew}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                        >
                            Start New Campaign
                        </button>
                        <button 
                            onClick={() => setActiveTab('history')}
                            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                        >
                            View History
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Progress Steps */}
                    <div className="relative after:absolute after:inset-x-0 after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:bg-gray-200">
                        <div className="relative z-10 flex justify-between">
                            {STEPS.map((step) => {
                                const isActive = step.id === currentStep
                                const isCompleted = step.id < currentStep
                                return (
                                    <div 
                                        key={step.id} 
                                        className={`flex flex-col items-center bg-gray-50 px-2 ${isCompleted ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                                        onClick={() => {
                                            if (isCompleted) {
                                                setCurrentStep(step.id)
                                            }
                                        }}
                                    >
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${isActive ? 'border-indigo-600 bg-indigo-600 text-white' :
                                                isCompleted ? 'border-green-500 bg-green-500 text-white' :
                                                    'border-gray-300 bg-white text-gray-400'
                                            }`}>
                                            <step.icon className="h-5 w-5" />
                                        </div>
                                        <span className={`mt-2 text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500'}`}>
                                            {step.name}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Step Content */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 min-h-[400px]">
                        {currentStep === 1 && (
                            <div className="max-w-md mx-auto space-y-6">
                                <div className="text-center mb-8">
                                    <h2 className="text-lg font-medium text-gray-900">Campaign Details</h2>
                                    <p className="text-sm text-gray-500">Give your campaign a name and schedule it.</p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        placeholder="e.g. Summer Sale Announcement"
                                        value={campaign.name}
                                        onChange={e => setCampaign({ ...campaign, name: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Account <span className="text-red-500">*</span></label>
                                    {isLoading.accounts ? (
                                        <div className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Loading accounts...</div>
                                    ) : (
                                        <select 
                                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                            value={campaign.wa_account_id}
                                            onChange={e => setCampaign({ ...campaign, wa_account_id: e.target.value })}
                                        >
                                            <option value="">Select an account</option>
                                            {waAccounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>{acc.display_phone_number || acc.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (Optional)</label>
                                    <input
                                        type="datetime-local"
                                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                        value={campaign.scheduled_at}
                                        onChange={e => setCampaign({ ...campaign, scheduled_at: e.target.value })}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Leave empty to send immediately.</p>
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="max-w-3xl mx-auto space-y-6">
                                <div className="text-center mb-8">
                                    <h2 className="text-lg font-medium text-gray-900">Select Audience</h2>
                                    <p className="text-sm text-gray-500">Who should receive this message?</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <label className={`
                                        relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none transition-colors
                                        ${campaign.audience_tag === '' ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white hover:bg-gray-50'}
                                    `}>
                                        <input
                                            type="radio"
                                            name="audience"
                                            className="sr-only"
                                            checked={campaign.audience_tag === ''}
                                            onChange={() => setCampaign({ ...campaign, audience_tag: '' })}
                                        />
                                        <span className="flex flex-1">
                                            <span className="flex flex-col">
                                                <span className="block text-sm font-medium text-gray-900">All Contacts</span>
                                                <span className="mt-1 flex items-center text-sm text-gray-500">
                                                    <Users className="h-4 w-4 mr-1" />
                                                    {isLoading.contacts ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : null}
                                                    {contacts.length} contacts
                                                </span>
                                            </span>
                                        </span>
                                        <Check className={`h-5 w-5 ${campaign.audience_tag === '' ? 'text-indigo-600' : 'invisible'}`} />
                                    </label>
                                    
                                    <label className={`
                                        relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none transition-colors
                                        ${campaign.audience_tag === 'CSV_UPLOAD' ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white hover:bg-gray-50'}
                                    `}>
                                        <input
                                            type="radio"
                                            name="audience"
                                            className="sr-only"
                                            checked={campaign.audience_tag === 'CSV_UPLOAD'}
                                            onChange={() => setCampaign({ ...campaign, audience_tag: 'CSV_UPLOAD' })}
                                        />
                                        <span className="flex flex-1">
                                            <span className="flex flex-col">
                                                <span className="block text-sm font-medium text-gray-900">Upload CSV File</span>
                                                <span className="mt-1 flex items-center text-sm text-gray-500">
                                                    <FileText className="h-4 w-4 mr-1" />
                                                    {csvData ? `${csvData.length} contacts loaded` : 'Custom File Upload'}
                                                </span>
                                            </span>
                                        </span>
                                        <Check className={`h-5 w-5 ${campaign.audience_tag === 'CSV_UPLOAD' ? 'text-indigo-600' : 'invisible'}`} />
                                    </label>

                                    {isLoading.tags ? (
                                        <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-center text-gray-400">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        </div>
                                    ) : tags.map((tag) => {
                                        const tagCount = contacts.filter(c => Array.isArray(c.tags) && c.tags.includes(tag)).length;
                                        return (
                                            <label key={tag} className={`
                                                relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none transition-colors
                                                ${campaign.audience_tag === tag ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white hover:bg-gray-50'}
                                            `}>
                                                <input
                                                    type="radio"
                                                    name="audience"
                                                    className="sr-only"
                                                    checked={campaign.audience_tag === tag}
                                                    onChange={() => setCampaign({ ...campaign, audience_tag: tag })}
                                                />
                                                <span className="flex flex-1">
                                                    <span className="flex flex-col">
                                                        <span className="block text-sm font-medium text-gray-900">{tag}</span>
                                                        <span className="mt-1 flex items-center text-sm text-gray-500">
                                                            <Users className="h-4 w-4 mr-1" />
                                                            {tagCount} contacts
                                                        </span>
                                                    </span>
                                                </span>
                                                <Check className={`h-5 w-5 ${campaign.audience_tag === tag ? 'text-indigo-600' : 'invisible'}`} />
                                            </label>
                                        )
                                    })}

                                    {campaign.audience_tag === 'CSV_UPLOAD' && (
                                        <div className="col-span-2 mt-4 p-8 border-2 border-dashed border-gray-300 rounded-xl text-center bg-gray-50 transition-colors hover:border-indigo-400">
                                            <input type="file" accept=".csv" className="hidden" id="csv-upload" onChange={handleFileUpload} />
                                            <label htmlFor="csv-upload" className="cursor-pointer">
                                                <div className="mx-auto h-12 w-12 text-indigo-500 bg-indigo-100 rounded-full flex items-center justify-center mb-3">
                                                    <FileText className="h-6 w-6" />
                                                </div>
                                                <span className="text-indigo-600 font-bold hover:text-indigo-800 text-lg">Click here to upload CSV</span>
                                                <p className="text-sm text-gray-500 mt-2">Make sure it has a "Phone" and "Name" column.</p>
                                            </label>
                                            {csvFileName && (
                                                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg inline-block text-indigo-800 font-medium text-sm shadow-sm">
                                                    File Loaded: {csvFileName} <span className="mx-2 text-indigo-300">|</span> {csvData?.length || 0} contacts found
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-8">
                                    <h3 className="text-sm font-medium text-gray-700 mb-3">Preview Audience ({filteredContacts.length})</h3>
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                                        {filteredContacts.slice(0, 5).map((c, i) => (
                                            <div key={c.id || i} className="flex justify-between text-sm">
                                                <span className="font-medium text-gray-900">{c.custom_name || c.name || 'Unknown'}</span>
                                                <span className="text-gray-500">{c.phone || c.wa_id}</span>
                                            </div>
                                        ))}
                                        {filteredContacts.length > 5 && (
                                            <div className="text-sm text-gray-400 pt-2 border-t border-gray-200 text-center">
                                                and {filteredContacts.length - 5} more...
                                            </div>
                                        )}
                                        {filteredContacts.length === 0 && (
                                            <div className="text-sm text-gray-400 text-center py-4">No contacts to display</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <h2 className="text-lg font-medium text-gray-900 mb-4">Select Template</h2>
                                    {isLoading.templates ? (
                                        <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                                    ) : (
                                        <div className="space-y-3 h-[400px] overflow-y-auto pr-2">
                                            {templates.filter(t => t.status === 'APPROVED').map((tpl) => (
                                                <div
                                                    key={tpl.id || tpl.name}
                                                    onClick={() => {
                                                        setHeaderMediaUrl('');
                                                        setCustomTexts({});
                                                        setCampaign({
                                                            ...campaign,
                                                            template_name: tpl.name,
                                                            template_language: tpl.language,
                                                            variable_mapping: cleanTemplateMapping(campaign.variable_mapping)
                                                        });
                                                    }}
                                                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${campaign.template_name === tpl.name
                                                            ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                                                            : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="font-medium text-gray-900">{tpl.name}</div>
                                                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">APPROVED</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-2 line-clamp-2">
                                                        {tpl.components?.find(c => c.type === 'BODY')?.text || 'No preview'}
                                                    </div>
                                                    <div className="mt-3 text-[11px] font-medium text-gray-400">
                                                        {getTemplateComponentSummary(tpl.components)}
                                                    </div>
                                                </div>
                                            ))}
                                            {templates.filter(t => t.status === 'APPROVED').length === 0 && (
                                                <div className="text-sm text-gray-500 text-center p-4">No approved templates found.</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div className="mb-4 flex items-start justify-between gap-3">
                                        <div>
                                            <h2 className="text-lg font-semibold text-gray-900">Content setup</h2>
                                            <p className="mt-1 text-sm text-gray-500">Map template placeholders to contact fields or fixed values.</p>
                                        </div>
                                        {selectedTemplate && (
                                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                                                {getTemplateComponentSummary(selectedTemplate.components)}
                                            </span>
                                        )}
                                    </div>
                                    {selectedTemplate ? (
                                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                                            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
                                                <div className="text-sm font-semibold text-gray-900">{selectedTemplate.name}</div>
                                                <div className="mt-1 text-xs text-gray-500">{selectedTemplate.category || 'Template'} · {selectedTemplate.language}</div>
                                            </div>
                                            <div className="space-y-5 p-5">
                                            {needsHeaderMedia && (
                                                <div className="rounded-lg border border-gray-200 bg-white">
                                                    <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-3">
                                                        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                                            <FileText className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="text-sm font-semibold text-gray-900">Template header</h3>
                                                                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">Required</span>
                                                            </div>
                                                            <p className="mt-1 text-xs text-gray-500">
                                                                This approved template has a {selectedHeaderFormat.toLowerCase()} header, so Meta requires one public media URL for every send.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3 p-4">
                                                        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50">
                                                            {isHeaderUploading ? (
                                                                <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                                                            ) : (
                                                                <Upload className="h-5 w-5 text-indigo-600" />
                                                            )}
                                                            <span className="mt-2 text-sm font-medium text-indigo-700">
                                                                {isHeaderUploading ? 'Uploading...' : `Upload ${selectedHeaderFormat.toLowerCase()}`}
                                                            </span>
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept={selectedHeaderFormat === 'IMAGE' ? 'image/*' : selectedHeaderFormat === 'VIDEO' ? 'video/mp4,video/*' : '*/*'}
                                                                disabled={isHeaderUploading}
                                                                onChange={(e) => handleHeaderMediaUpload(e.target.files?.[0])}
                                                            />
                                                        </label>
                                                        <div>
                                                            <label className="mb-1.5 block text-xs font-medium text-gray-700">Public media URL</label>
                                                            <div className="relative">
                                                                <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                                                <input
                                                                    type="url"
                                                                    required
                                                                    placeholder="https://..."
                                                                    className={`h-10 w-full rounded-lg pl-9 text-sm ${headerMediaUrl.trim() ? 'border-gray-300' : 'border-red-300 bg-red-50'}`}
                                                                    value={headerMediaUrl}
                                                                    onChange={(e) => syncHeaderMediaUrl(e.target.value)}
                                                                />
                                                            </div>
                                                            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
                                                                <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                                                                Header placeholder text is not sent. Use an uploaded file or a public URL.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {dynamicUrlButtons.map((button) => (
                                                <div key={`button-url-${button.index}`} className="rounded-lg border border-gray-200 bg-white p-4">
                                                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                        URL button · {button.text}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        required
                                                        placeholder={`Value for "${button.text}" URL`}
                                                        className={`h-10 w-full rounded-lg text-sm ${(campaign.variable_mapping[`_button_url_${button.index}`] || campaign.variable_mapping[`button_url_${button.index}`]) ? 'border-gray-300' : 'border-red-300 bg-red-50'}`}
                                                        value={campaign.variable_mapping[`_button_url_${button.index}`] || campaign.variable_mapping[`button_url_${button.index}`] || ''}
                                                        onChange={(e) => handleButtonUrlParamChange(button.index, e.target.value)}
                                                    />
                                                    <p className="mt-1 text-xs text-gray-500">
                                                        Approved URL: {button.url}. Enter only the placeholder value, for example ads or ?utm_source=whatsapp.
                                                    </p>
                                                </div>
                                            ))}
                                            {(variables.length > 0 || dynamicUrlButtons.length > 0) && (
                                                <div className="border-t border-gray-100 pt-5">
                                                    <h3 className="text-sm font-semibold text-gray-900">Body variables</h3>
                                                    <p className="mt-1 text-xs text-gray-500">Choose where each placeholder value should come from.</p>
                                                </div>
                                            )}
                                            {variables.length > 0 ? variables.map((variable) => (
                                                <div key={variable.key} className="rounded-lg border border-gray-200 bg-white p-4">
                                                    <div className="mb-3 flex items-center justify-between gap-3">
                                                        <div>
                                                            <label className="block text-sm font-semibold capitalize text-gray-900">
                                                                {variable.label}
                                                            </label>
                                                            <div className="mt-0.5 font-mono text-xs text-gray-400">{variable.token}</div>
                                                        </div>
                                                    </div>
                                                    <select 
                                                        className="h-10 w-full rounded-lg border-gray-300 text-sm"
                                                        value={campaign.variable_mapping[variable.key] || ''}
                                                        onChange={e => handleVariableMapChange(variable.key, e.target.value)}
                                                    >
                                                        <option value="">Select source</option>
                                                        <option value="name">Contact Name</option>
                                                        <option value="phone">Contact Phone</option>
                                                        <option value="custom">Custom Text...</option>
                                                    </select>
                                                    
                                                    {campaign.variable_mapping[variable.key] === 'custom' && (
                                                        <input 
                                                            type="text" 
                                                            placeholder="Enter custom text..." 
                                                            className="mt-2 h-10 w-full rounded-lg border-gray-300 text-sm"
                                                            value={customTexts[variable.key] || ''}
                                                            onChange={e => setCustomTexts({ ...customTexts, [variable.key]: e.target.value })}
                                                        />
                                                    )}
                                                </div>
                                            )) : (
                                                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 py-8 text-center text-sm text-gray-500">
                                                    This template has no variables.
                                                </div>
                                            )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                                            Select a template first
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="max-w-lg mx-auto text-center space-y-6">
                                <div className="mx-auto h-16 w-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                    <Send className="h-8 w-8 ml-1" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">Ready to Launch?</h2>
                                    <p className="text-gray-500 mt-2">
                                        You are about to schedule <strong>{campaign.template_name}</strong> to <strong>{filteredContacts.length} contacts</strong>.
                                    </p>
                                </div>

                                <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-3 border border-gray-200">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Campaign Name</span>
                                        <span className="font-medium text-gray-900">{campaign.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Account</span>
                                        <span className="font-medium text-gray-900">
                                            {waAccounts.find(a => a.id === campaign.wa_account_id)?.display_phone_number || 'Unknown'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Audience</span>
                                        <span className="font-medium text-gray-900">{campaign.audience_tag === 'CSV_UPLOAD' ? `CSV Upload (${csvData.length} contacts)` : (campaign.audience_tag || 'All Contacts')}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Schedule</span>
                                        <span className="font-medium text-gray-900">{campaign.scheduled_at ? format(new Date(campaign.scheduled_at), 'PPp') : 'Send Immediately'}</span>
                                    </div>
                                </div>

                                <button 
                                    disabled={isSending}
                                    onClick={handleLaunch}
                                    className="w-full py-3 flex items-center justify-center gap-2 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 shadow-lg shadow-green-200 transition-all transform hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
                                >
                                    {isSending ? (
                                        <><Loader2 className="w-5 h-5 animate-spin" /> {campaign.scheduled_at ? 'Scheduling...' : `Sending to ${filteredContacts.length} contacts...`}</>
                                    ) : (
                                        campaign.scheduled_at ? 'Schedule Campaign' : 'Launch Campaign Now'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between pt-4">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 1 || isSending}
                            className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Back
                        </button>

                        {currentStep < 4 && (
                            <button
                                onClick={handleNext}
                                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800"
                            >
                                Next Step <ArrowRight className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
