import React, { useState, useEffect } from 'react'
import { Send, Users, FileText, Calendar, Check, ArrowRight, LayoutGrid, Loader2, Clock, Trash2, ChevronDown, ChevronUp, Upload, Link as LinkIcon, Info, Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { formatINRFromPaise } from '../config/whatsappPricing'
import TourButton from '../onboarding/TourButton'

const STEPS = [
    { id: 1, name: 'Details', icon: LayoutGrid },
    { id: 2, name: 'Audience', icon: Users },
    { id: 3, name: 'Template', icon: LayoutGrid },
    { id: 4, name: 'Content', icon: FileText },
    { id: 5, name: 'Review', icon: Check },
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
    const { alertDialog, confirmDialog } = useDialog()
    const token = session?.access_token

    const getPreviewText = () => {
        if (!selectedTemplate) return '';
        const bodyComponent = selectedTemplate.components?.find(c => c.type === 'BODY');
        let text = bodyComponent?.text || '';

        variables.forEach(v => {
            const source = campaign.variable_mapping[v.key];
            let replacement = v.token;
            if (source === 'name') {
                replacement = '[Contact Name]';
            } else if (source === 'phone') {
                replacement = '[Contact Phone]';
            } else if (source === 'custom') {
                replacement = customTexts[v.key] || v.token;
            }
            text = text.replaceAll(v.token, replacement);
        });
        return text;
    };

    const formatWhatsAppText = (text) => {
        if (!text) return '';
        let escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        escaped = escaped.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
        escaped = escaped.replace(/_(.*?)_/g, '<em>$1</em>');
        escaped = escaped.replace(/~(.*?)~/g, '<del>$1</del>');
        escaped = escaped.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded font-mono text-xs">$1</code>');
        escaped = escaped.replace(/\n/g, '<br />');

        return <span dangerouslySetInnerHTML={{ __html: escaped }} />;
    };


    const [activeTab, setActiveTab] = useState('new') // 'new' | 'history'
    const [campaignsList, setCampaignsList] = useState([])
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [expandedCampaignId, setExpandedCampaignId] = useState(null)

    const [currentStep, setCurrentStep] = useState(1)
    const [campaign, setCampaign] = useState({
        name: '',
        wa_account_id: '',
        scheduled_at: '',
        audience_type: 'saved',
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
    const [billingEstimate, setBillingEstimate] = useState(null)
    const [isEstimating, setIsEstimating] = useState(false)
    const [estimateError, setEstimateError] = useState('')

    const selectedTemplate = templates.find(t => t.name === campaign.template_name && t.language === campaign.template_language)
        || templates.find(t => t.name === campaign.template_name)
    const variables = selectedTemplate ? parseVars(selectedTemplate.components) : []
    const dynamicUrlButtons = selectedTemplate ? parseDynamicUrlButtons(selectedTemplate.components) : []
    const selectedHeader = selectedTemplate?.components?.find(c => c.type === 'HEADER')
    const selectedHeaderFormat = String(selectedHeader?.format || '').toUpperCase()
    const needsHeaderMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(selectedHeaderFormat)
    const [headerMediaUrl, setHeaderMediaUrl] = useState('')
    const [isHeaderUploading, setIsHeaderUploading] = useState(false)

    const filteredContacts = campaign.audience_type === 'CSV_UPLOAD'
        ? (csvData || [])
        : campaign.audience_type === 'tag' && campaign.audience_tag
            ? contacts.filter(c => Array.isArray(c.tags) && c.tags.includes(campaign.audience_tag))
            : campaign.audience_type === 'saved'
                ? contacts.filter(c => c.saved_at != null)
                : contacts;

    const selectedTemplateCategory = selectedTemplate?.category || campaign.variable_mapping?._template_category || 'MARKETING'

    useEffect(() => {
        if (!token) return;

        apiCall(`${API_URL}/api/whatsapp/accounts`)
            .then(res => res.json())
            .then(data => { setWaAccounts(Array.isArray(data) ? data : []); setIsLoading(p => ({ ...p, accounts: false })) })
            .catch(() => setIsLoading(p => ({ ...p, accounts: false })));

        apiCall(`${API_URL}/api/broadcasts/tags`)
            .then(res => res.json())
            .then(data => { setTags(data?.tags || []); setIsLoading(p => ({ ...p, tags: false })) })
            .catch(() => setIsLoading(p => ({ ...p, tags: false })));

        apiCall(`${API_URL}/api/whatsapp/templates`)
            .then(res => res.json())
            .then(data => { setTemplates(Array.isArray(data) ? data : []); setIsLoading(p => ({ ...p, templates: false })) })
            .catch(() => setIsLoading(p => ({ ...p, templates: false })));

        setIsLoading(p => ({ ...p, contacts: true }));
        apiCall(`${API_URL}/api/contacts?include_unsaved=true`)
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
        apiCall(`${API_URL}/api/broadcasts/campaigns`)
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

    useEffect(() => {
        if (currentStep !== 4 || !token || !campaign.template_name) return;
        let cancelled = false;

        const fetchEstimate = async () => {
            setIsEstimating(true);
            setEstimateError('');
            try {
                const res = await apiCall(`${API_URL}/api/broadcasts/estimate`, {
                    method: 'POST',
                    body: JSON.stringify({
                        audience_tag: campaign.audience_type === 'CSV_UPLOAD' || campaign.audience_type === 'all' || campaign.audience_type === 'saved' ? null : campaign.audience_tag,
                        audience_type: campaign.audience_type === 'CSV_UPLOAD' ? null : (campaign.audience_type === 'all' || campaign.audience_type === 'saved' ? campaign.audience_type : 'tag'),
                        csv_data: campaign.audience_type === 'CSV_UPLOAD' ? csvData : null,
                        template_category: selectedTemplateCategory,
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to estimate broadcast cost');
                if (!cancelled) setBillingEstimate(data);
            } catch (err) {
                if (!cancelled) {
                    setBillingEstimate(null);
                    setEstimateError(err.message || 'Failed to estimate broadcast cost');
                }
            } finally {
                if (!cancelled) setIsEstimating(false);
            }
        };

        fetchEstimate();
        return () => { cancelled = true; };
    }, [currentStep, token, campaign.audience_tag, campaign.template_name, selectedTemplateCategory, csvData]);

    const deleteCampaign = async (id) => {
        const confirmed = await confirmDialog('Are you sure you want to cancel and delete this scheduled campaign?', {
            title: 'Delete scheduled campaign',
            tone: 'danger',
            confirmLabel: 'Delete campaign',
        });
        if (!confirmed) return;
        try {
            const res = await apiCall(`${API_URL}/api/broadcasts/campaigns/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchCampaignHistory();
            } else {
                const data = await res.json();
                alertDialog(data.error || 'Failed to delete', { title: 'Delete failed', tone: 'danger' });
            }
        } catch (e) {
            alertDialog('Error: ' + e.message, { title: 'Delete failed', tone: 'danger' });
        }
    }

    const cancelCampaign = async (id) => {
        const confirmed = await confirmDialog('Are you sure you want to stop this campaign? It will be permanently cancelled.', {
            title: 'Stop & Cancel Campaign',
            tone: 'danger',
            confirmLabel: 'Stop Campaign',
        });
        if (!confirmed) return;
        try {
            const res = await apiCall(`${API_URL}/api/broadcasts/campaigns/${id}/cancel`, {
                method: 'POST'
            });
            if (res.ok) {
                fetchCampaignHistory();
            } else {
                const data = await res.json();
                alertDialog(data.error || 'Failed to cancel campaign', { title: 'Cancellation failed', tone: 'danger' });
            }
        } catch (e) {
            alertDialog('Error: ' + e.message, { title: 'Cancellation failed', tone: 'danger' });
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
                alertDialog('CSV is empty', { title: 'CSV import failed', tone: 'warning' });
                return;
            }

            const headers = lines[0].split(',').map(h => h.toLowerCase().trim());
            const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('number'));
            const nameIdx = headers.findIndex(h => h.includes('name'));

            if (phoneIdx === -1) {
                alertDialog('CSV must contain a column for phone numbers (e.g. "Phone" or "Number")', { title: 'CSV import failed', tone: 'warning' });
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

    const validateHeaderMediaUrl = async () => {
        if (!needsHeaderMedia) return true
        const url = headerMediaUrl.trim()
        if (!url) {
            await alertDialog(`This template has a ${selectedHeaderFormat.toLowerCase()} header. Upload media or paste a public URL before sending.`, { title: 'Header media required', tone: 'warning' })
            return false
        }
        if (!/^https?:\/\/.+\..+/.test(url)) {
            await alertDialog('Header media URL must be a public http/https URL.', { title: 'Invalid media URL', tone: 'warning' })
            return false
        }
        if (/^https?:\/\/example\.com\//i.test(url)) {
            await alertDialog('Please replace the example URL with your actual public media URL.', { title: 'Replace example URL', tone: 'warning' })
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
            const res = await apiCall(`${API_URL}/api/broadcasts/header-media`, {
                method: 'POST',
                body: formData
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to upload header media')
            syncHeaderMediaUrl(data.publicUrl || '')
        } catch (err) {
            alertDialog(err.message, { title: 'Upload failed', tone: 'danger' })
        } finally {
            setIsHeaderUploading(false)
        }
    }

    const handleNext = async () => {
        if (currentStep === 1) {
            if (!campaign.name || !campaign.wa_account_id) return alertDialog('Campaign Name and WA Account are required.', { title: 'Missing campaign details', tone: 'warning' });
            const selectedAccountForCampaign = waAccounts.find(account => account.id === campaign.wa_account_id);
            if (selectedAccountForCampaign && !selectedAccountForCampaign.whatsapp_business_account_id) {
                return alertDialog('QR Session numbers cannot run broadcast campaigns. Select a Meta API account with approved template access.', { title: 'Meta API account required', tone: 'warning' });
            }
        }
        if (currentStep === 2) {
            if (campaign.audience_tag === 'CSV_UPLOAD' && (!csvData || csvData.length === 0)) {
                return alertDialog('Please upload a valid CSV file with contacts.', { title: 'Audience required', tone: 'warning' });
            }
            if (filteredContacts.length === 0) return alertDialog('No contacts selected in audience.', { title: 'Audience required', tone: 'warning' });
        }
        if (currentStep === 3) {
            if (!campaign.template_name) return alertDialog('Please select a template.', { title: 'Template required', tone: 'warning' });
        }
        if (currentStep === 4) {
            if (!(await validateHeaderMediaUrl())) return;
            for (const button of dynamicUrlButtons) {
                const validation = validateDynamicUrlButtonValue(button, campaign.variable_mapping[`_button_url_${button.index}`] || campaign.variable_mapping[`button_url_${button.index}`])
                if (!validation.ok) {
                    return alertDialog(validation.message, { title: 'Button URL needs attention', tone: 'warning' });
                }
            }
            for (let variable of variables) {
                const key = variable.key
                if (!campaign.variable_mapping[key] && !customTexts[key]) {
                    return alertDialog(`Please map ${variable.token}.`, { title: 'Variable mapping required', tone: 'warning' });
                }
            }
        }
        setCurrentStep(p => Math.min(5, p + 1))
    };

    const handleBack = () => setCurrentStep(p => Math.max(1, p - 1));

    const handleLaunch = async () => {
        if (!(await validateHeaderMediaUrl())) return;
        if (billingEstimate && !billingEstimate.can_launch) {
            const reason = !billingEstimate.plan?.allowed
                ? 'Your current plan has reached its monthly broadcast limit.'
                : !billingEstimate.enough_wallet
                    ? 'Wallet balance is not enough for this campaign.'
                    : 'Broadcast cannot be launched with the current estimate.';
            return alertDialog(reason, { title: 'Billing check failed', tone: 'warning' });
        }
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
        finalMapping._template_category = selectedTemplateCategory;
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
            audience_tag: campaign.audience_type === 'CSV_UPLOAD' || campaign.audience_type === 'all' || campaign.audience_type === 'saved' ? null : campaign.audience_tag,
            audience_type: campaign.audience_type === 'CSV_UPLOAD' ? null : (campaign.audience_type === 'all' || campaign.audience_type === 'saved' ? campaign.audience_type : 'tag'),
            csv_data: campaign.audience_type === 'CSV_UPLOAD' ? csvData : null,
            variable_mapping: finalMapping,
            required_header_type: needsHeaderMedia ? selectedHeaderFormat.toLowerCase() : undefined,
            header_media_type: needsHeaderMedia ? selectedHeaderFormat.toLowerCase() : undefined,
            header_media_url: needsHeaderMedia ? headerMediaUrl.trim() : undefined
        };

        try {
            const res = await apiCall(`${API_URL}/api/broadcasts/send`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                setSendResult(data);
            } else {
                alertDialog(data.error || 'Broadcast failed', { title: 'Broadcast failed', tone: 'danger' });
            }
        } catch (e) {
            alertDialog('Error launching broadcast: ' + e.message, { title: 'Broadcast failed', tone: 'danger' });
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
            audience_type: 'saved',
            audience_tag: '',
            template_name: '',
            variable_mapping: {}
        });
    }

    const renderLivePreview = () => {
        if (!selectedTemplate) return null;
        return (
            <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Live Preview
                </h3>
                
                <div className="rounded-xl border border-gray-250/80 bg-[#efeae2] p-4 relative overflow-hidden flex flex-col justify-between shadow-[inset_0_2px_4px_rgba(0,0,0,0.03)] min-h-[220px]">
                    {/* Chat pattern background simulation */}
                    <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath fill-rule='evenodd' d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7z'/%3E%3C/g%3E%3C/svg%3E")`
                    }} />

                    {/* WhatsApp Bubble */}
                    <div className="relative z-10 max-w-[85%] rounded-lg rounded-tl-none bg-white p-3.5 shadow-sm border border-gray-150 self-start">
                        {/* Header text/media */}
                        {selectedTemplate.components?.find(c => c.type === 'HEADER') && (() => {
                            const header = selectedTemplate.components.find(c => c.type === 'HEADER');
                            if (header.format === 'TEXT') {
                                return <div className="font-bold text-gray-900 text-sm mb-1.5">{header.text}</div>;
                            }
                            if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format)) {
                                return (
                                    <div className="mb-2 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center h-32 w-full text-gray-400 font-semibold text-xs overflow-hidden relative">
                                        {headerMediaUrl ? (
                                            header.format === 'IMAGE' ? (
                                                <img src={headerMediaUrl} alt="Header media preview" className="w-full h-full object-cover" />
                                            ) : header.format === 'VIDEO' ? (
                                                <video src={headerMediaUrl} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1.5 p-3">
                                                    <FileText className="h-8 w-8 text-indigo-500" />
                                                    <span className="truncate max-w-[150px] text-gray-600 font-mono text-[10px]">{headerMediaUrl.split('/').pop()}</span>
                                                </div>
                                            )
                                        ) : (
                                            <span className="flex flex-col items-center gap-1">
                                                <span className="uppercase text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-600 font-bold">{header.format} Header</span>
                                                <span className="text-[10px] text-gray-400 font-normal">Pending media mapping</span>
                                            </span>
                                        )}
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* Body */}
                        <div className="text-gray-900 text-sm break-words whitespace-pre-wrap leading-relaxed">
                            {formatWhatsAppText(getPreviewText())}
                        </div>

                        {/* Footer */}
                        {selectedTemplate.components?.find(c => c.type === 'FOOTER') && (
                            <div className="text-[11px] text-gray-400 mt-1">
                                {selectedTemplate.components.find(c => c.type === 'FOOTER').text}
                            </div>
                        )}

                        {/* Time & status */}
                        <div className="flex items-center justify-end gap-1 text-[9px] text-gray-400 mt-1 select-none">
                            <span>12:00 PM</span>
                            <span className="text-blue-500">✓✓</span>
                        </div>
                    </div>

                    {/* Buttons */}
                    {selectedTemplate.components?.find(c => c.type === 'BUTTONS') && (
                        <div className="relative z-10 mt-2 space-y-1.5 self-start w-[85%]">
                            {selectedTemplate.components.find(c => c.type === 'BUTTONS').buttons.map((btn, idx) => (
                                <div key={idx} className="flex items-center justify-center gap-2 rounded-lg bg-white py-2 px-3 shadow-sm border border-gray-200 text-xs font-bold text-sky-600 cursor-default hover:bg-gray-50 transition-colors">
                                    {btn.type === 'PHONE_NUMBER' ? '📞' : btn.type === 'URL' ? '🔗' : '↩️'}
                                    <span className="truncate">{btn.text}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="mx-auto max-w-7xl space-y-8 pb-16">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Broadcasts</h1>
                    <p className="text-sm text-gray-500 mt-2 max-w-lg leading-relaxed">Design, schedule, and track bulk message campaigns for your audience.</p>
                </div>
                <div data-tour="broadcast-tabs" className="flex flex-wrap items-center gap-2">
                    <TourButton />
                    <div className="flex bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 shadow-sm backdrop-blur-sm">
                        <button
                            onClick={() => setActiveTab('new')}
                            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 ${activeTab === 'new' ? 'bg-white shadow-sm text-indigo-700 ring-1 ring-gray-200/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                        >
                            New Campaign
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-300 ${activeTab === 'history' ? 'bg-white shadow-sm text-indigo-700 ring-1 ring-gray-200/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                        >
                            History
                        </button>
                    </div>
                </div>
            </div>

            {activeTab === 'history' ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-8 py-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-b from-gray-50/50 to-white">
                        <h2 className="text-xl font-bold text-gray-900">Campaign History</h2>
                        <button onClick={fetchCampaignHistory} className="text-sm text-indigo-600 font-semibold hover:text-indigo-800 flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-lg transition-colors">
                            <Loader2 className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
                            Refresh Data
                        </button>
                    </div>
                    {isLoadingHistory && campaignsList.length === 0 ? (
                        <div className="p-16 text-center flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-500" /></div>
                    ) : campaignsList.length === 0 ? (
                        <div className="p-16 text-center flex flex-col items-center justify-center">
                            <div className="w-16 h-16 bg-indigo-50 text-indigo-300 rounded-2xl flex items-center justify-center mb-4"><Calendar className="w-8 h-8" /></div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">No campaigns found</h3>
                            <p className="text-gray-500">Schedule your first broadcast to engage your audience.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50/80 text-gray-500 font-semibold uppercase text-xs tracking-wider border-b border-gray-200">
                                    <tr>
                                        <th className="px-8 py-5">Campaign Name</th>
                                        <th className="px-8 py-5">Status</th>
                                        <th className="px-8 py-5">Audience</th>
                                        <th className="px-8 py-5">Date / Scheduled</th>
                                        <th className="px-8 py-5">Performance</th>
                                        <th className="px-8 py-5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {campaignsList.map(camp => (
                                        <React.Fragment key={camp.id}>
                                            <tr className="hover:bg-gray-50/60 transition-colors">
                                                <td className="px-8 py-5">
                                                    <div className="font-bold text-gray-900">{camp.name}</div>
                                                    <div className="text-xs font-medium text-gray-500 mt-1 flex items-center gap-1.5">
                                                        <FileText className="w-3.5 h-3.5" /> {camp.template_name}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <span className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wide flex items-center inline-flex gap-1.5 ${camp.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' :
                                                            camp.status === 'failed' ? 'bg-rose-50 text-rose-700 border border-rose-200/60' :
                                                                camp.status === 'cancelled' ? 'bg-gray-50 text-gray-700 border border-gray-300' :
                                                                    camp.status === 'processing' ? 'bg-blue-50 text-blue-700 border border-blue-200/60' :
                                                                        'bg-amber-50 text-amber-700 border border-amber-200/60'
                                                        }`}>
                                                        {camp.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                                                        {camp.status}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 text-gray-600 font-medium">
                                                    <div className="flex items-center gap-1.5">
                                                        <Users className="w-4 h-4 text-gray-400" />
                                                        {camp.audience_tag || (camp.csv_data ? 'CSV Upload' : 'All Contacts')}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-gray-600 font-medium">
                                                    {camp.scheduled_at ? format(new Date(camp.scheduled_at), 'MMM dd, yyyy · hh:mm a') : format(new Date(camp.created_at), 'MMM dd, yyyy · hh:mm a')}
                                                </td>
                                                <td className="px-8 py-5">
                                                    {camp.status === 'completed' ? (
                                                        <div className="flex gap-3 text-xs items-center">
                                                            <div className="flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                                                                <Check className="w-3.5 h-3.5" /> {camp.sent_count}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-rose-700 font-bold bg-rose-50 px-2.5 py-1.5 rounded-lg border border-rose-100">
                                                                <Info className="w-3.5 h-3.5" /> {camp.failed_count}
                                                            </div>
                                                        </div>
                                                    ) : <span className="text-gray-400 font-medium">-</span>}
                                                </td>
                                                <td className="px-8 py-5 text-right">
                                                    <div className="flex justify-end gap-3 items-center">
                                                        {(camp.status === 'processing' || camp.status === 'scheduled') && (
                                                            <button
                                                                onClick={() => cancelCampaign(camp.id)}
                                                                className="text-rose-600 hover:text-white text-xs font-bold flex items-center gap-1.5 bg-rose-50 hover:bg-rose-500 px-3 py-1.5 rounded-lg transition-colors border border-rose-200 hover:border-rose-500"
                                                                title="Stop and Abandon Campaign"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" /> Stop & Cancel
                                                            </button>
                                                        )}
                                                        {(camp.status === 'completed' || camp.status === 'cancelled') && camp.results && camp.results.length > 0 && (
                                                            <button
                                                                onClick={() => setExpandedCampaignId(expandedCampaignId === camp.id ? null : camp.id)}
                                                                className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                                                            >
                                                                {expandedCampaignId === camp.id ? 'Hide Details' : 'View Results'}
                                                                {expandedCampaignId === camp.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedCampaignId === camp.id && camp.results && (
                                                <tr>
                                                    <td colSpan="6" className="bg-gray-50/50 p-8 border-b border-gray-200 shadow-inner">
                                                        <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                                            <LayoutGrid className="w-4 h-4 text-gray-400" /> Delivery Report
                                                        </h4>
                                                        <div className="max-h-80 overflow-y-auto space-y-2.5 pr-3 scrollbar-thin scrollbar-thumb-gray-200">
                                                            {camp.results.map((res, idx) => (
                                                                <div key={idx} className="grid grid-cols-[1fr_auto] gap-4 text-sm p-4 bg-white rounded-xl shadow-sm border border-gray-200/60 hover:border-gray-300 transition-colors">
                                                                    <div className="flex min-w-0 items-center gap-3">
                                                                        <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${res.status === 'sent' ? 'bg-emerald-500 shadow-emerald-200' : 'bg-rose-500 shadow-rose-200'}`}></div>
                                                                        <span className="font-bold text-gray-900">{res.name}</span>
                                                                        <span className="text-gray-500 bg-gray-100/80 px-2.5 py-1 rounded-md font-mono text-xs">{res.phone || 'Unknown Phone'}</span>
                                                                    </div>
                                                                    {res.status === 'sent' ? (
                                                                        <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                                                                            <Check className="w-4 h-4" /> Delivered
                                                                        </span>
                                                                    ) : (
                                                                        <span className="max-w-xl whitespace-normal break-words text-right font-semibold text-rose-600 flex items-center gap-1.5" title={res.error}>
                                                                            <Info className="w-4 h-4 shrink-0" /> Failed: {res.error}
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
                        </div>
                    )}
                </div>
            ) : sendResult ? (
                <div className="max-w-2xl mx-auto mt-12 bg-white rounded-2xl shadow-xl shadow-gray-200/40 p-10 text-center space-y-8 border border-gray-100">
                    <div className={`mx-auto h-24 w-24 rounded-full flex items-center justify-center ${sendResult.status === 'scheduled' ? 'bg-amber-50 text-amber-500 ring-8 ring-amber-50' : 'bg-emerald-50 text-emerald-500 ring-8 ring-emerald-50'}`}>
                        {sendResult.status === 'scheduled' ? <Clock className="h-12 w-12" /> : <Check className="h-12 w-12" />}
                    </div>
                    <div>
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-3">
                            {sendResult.status === 'scheduled' ? 'Campaign Scheduled!' : 'Campaign Launched!'}
                        </h2>
                        <p className="text-gray-500 text-lg leading-relaxed">
                            {sendResult.status === 'scheduled'
                                ? `It will automatically run at ${format(new Date(campaign.scheduled_at), 'PPp')}.`
                                : 'Your messages are currently being processed in the background.'}
                        </p>
                    </div>
                    <div className="flex justify-center gap-4 pt-4 border-t border-gray-100">
                        <button
                            onClick={startNew}
                            className="px-8 py-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200 transition-all hover:-translate-y-0.5"
                        >
                            Start New Campaign
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className="px-8 py-3.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-bold shadow-sm transition-all"
                        >
                            View History
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-10">
                    {/* Progress Steps */}
                    <div data-tour="broadcast-stepper" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                        <div className="relative">
                            <div className="absolute left-8 right-8 top-5 h-0.5 bg-gray-200"></div>
                            <div className="absolute left-8 top-5 h-0.5 bg-[#0070d1] transition-all duration-500 ease-in-out" style={{ width: `calc(${((currentStep - 1) / (STEPS.length - 1)) * 100}% - ${currentStep === 1 ? '0px' : '4rem'})` }}></div>
                            <div className="relative z-10 grid grid-cols-5 gap-2">
                            {STEPS.map((step) => {
                                const isActive = step.id === currentStep
                                const isCompleted = step.id < currentStep
                                return (
                                    <button
                                        type="button"
                                        key={step.id} 
                                        className={`flex flex-col items-center rounded-xl px-2 py-1 text-center transition-colors ${isCompleted ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                                        onClick={() => {
                                            if (isCompleted) {
                                                setCurrentStep(step.id)
                                            }
                                        }}
                                        disabled={!isCompleted && !isActive}
                                    >
                                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-all ${
                                                isActive ? 'border-[#0070d1] bg-[#0070d1] text-white shadow-sm' :
                                                isCompleted ? 'border-emerald-500 bg-emerald-500 text-white' :
                                                'border-gray-200 bg-white text-gray-400'
                                            }`}>
                                            <step.icon className="h-5 w-5" />
                                        </div>
                                        <span className={`mt-2 text-xs font-bold uppercase tracking-wide transition-colors ${isActive ? 'text-[#0064b7]' : isCompleted ? 'text-emerald-600' : 'text-gray-400'}`}>
                                            {step.name}
                                        </span>
                                    </button>
                                )
                            })}
                            </div>
                        </div>
                    </div>

                    {/* Step Content */}
                    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                        {currentStep === 1 && (
                            <div className="grid gap-0 lg:grid-cols-[minmax(260px,0.85fr)_minmax(360px,1fr)_minmax(280px,0.8fr)]">
                                <div className="border-b border-gray-100 bg-gray-50 p-6 lg:border-b-0 lg:border-r lg:p-8">
                                    <div className="flex h-full flex-col justify-center">
                                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef7ff] text-[#0064b7]">
                                            <LayoutGrid className="h-5 w-5" />
                                        </div>
                                        <h2 className="mt-5 text-xl font-semibold text-gray-950">Campaign Details</h2>
                                        <p className="mt-3 text-sm leading-6 text-gray-600">Campaign ka naam, WhatsApp account, aur optional schedule set karein. Agar schedule empty hai to campaign immediately launch hoga.</p>
                                        <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                                            Broadcasts ke liye sirf official Meta API account use hoga. QR session accounts inbox testing ke liye hain.
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5 p-6 lg:p-8">
                                    <div>
                                        <label className="mb-1.5 block text-sm font-semibold text-gray-800">Campaign Name <span className="text-red-500">*</span></label>
                                        <input
                                            type="text"
                                            className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition focus:border-[#0070d1] focus:ring-2 focus:ring-[#0070d1]/10"
                                            placeholder="e.g. Summer Sale Announcement"
                                            value={campaign.name}
                                            onChange={e => setCampaign({ ...campaign, name: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-sm font-semibold text-gray-800">WhatsApp Account <span className="text-red-500">*</span></label>
                                        {isLoading.accounts ? (
                                            <div className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading accounts...</div>
                                        ) : (
                                            <div className="relative">
                                                <select
                                                    className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-white px-3 pr-10 text-sm text-gray-950 outline-none transition focus:border-[#0070d1] focus:ring-2 focus:ring-[#0070d1]/10"
                                                    value={campaign.wa_account_id}
                                                    onChange={e => setCampaign({ ...campaign, wa_account_id: e.target.value })}
                                                >
                                                    <option value="">Select an account</option>
                                                    {waAccounts.map(acc => {
                                                        const isMeta = Boolean(acc.whatsapp_business_account_id);
                                                        return (
                                                            <option key={acc.id} value={acc.id} disabled={!isMeta}>
                                                                {acc.display_phone_number || acc.name} {isMeta ? 'Meta API' : 'QR Session - broadcast unavailable'}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                            </div>
                                        )}
                                        <p className="mt-2 text-xs leading-5 text-gray-500">
                                            Approved templates ke saath Meta API account required hai.
                                        </p>
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-sm font-semibold text-gray-800">Schedule <span className="font-medium text-gray-400">(Optional)</span></label>
                                        <div className="relative">
                                            <input
                                                type="datetime-local"
                                                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-950 outline-none transition focus:border-[#0070d1] focus:ring-2 focus:ring-[#0070d1]/10"
                                                value={campaign.scheduled_at}
                                                onChange={e => setCampaign({ ...campaign, scheduled_at: e.target.value })}
                                            />
                                        </div>
                                        <p className="mt-2 text-xs text-gray-500">Leave empty to send immediately.</p>
                                    </div>
                                </div>

                                <div className="border-t border-gray-100 bg-white p-6 lg:border-l lg:border-t-0 lg:p-8">
                                    <div className="flex h-full min-h-[300px] items-center justify-center overflow-hidden rounded-xl bg-[#edf8f1]">
                                        <img
                                            src="/images/broadcast.png"
                                            alt="Broadcast campaign illustration"
                                            className="h-full min-h-[300px] w-full object-cover"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div data-tour="broadcast-recipients" className="p-6 lg:p-8">
                                <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                                    <div>
                                        <h2 className="text-xl font-semibold text-gray-950">Select Audience</h2>
                                        <p className="mt-1 text-sm text-gray-500">Choose exactly who should receive this broadcast.</p>
                                    </div>
                                    <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-semibold text-gray-700">
                                        {filteredContacts.length} recipients selected
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    <label className={`
                                        relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors
                                        ${campaign.audience_type === 'saved' ? 'border-[#0070d1] bg-[#eef7ff] ring-1 ring-[#0070d1]/20' : 'border-gray-200 bg-white hover:bg-gray-50'}
                                    `}>
                                        <input
                                            type="radio"
                                            name="audience"
                                            className="sr-only"
                                            checked={campaign.audience_type === 'saved'}
                                            onChange={() => setCampaign({ ...campaign, audience_type: 'saved', audience_tag: '' })}
                                        />
                                        <span className="flex flex-1">
                                            <span className="flex flex-col">
                                                <span className="block text-sm font-semibold text-gray-950">Saved Contacts Only <span className="ml-2 inline-flex items-center rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#0064b7] ring-1 ring-[#cfe5fb]">Recommended</span></span>
                                                <span className="mt-1 flex items-center text-sm text-gray-500">
                                                    <Users className="h-4 w-4 mr-1" />
                                                    {isLoading.contacts ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                                    {contacts.filter(c => c.saved_at != null).length} saved contacts
                                                </span>
                                            </span>
                                        </span>
                                        <Check className={`h-5 w-5 ${campaign.audience_type === 'saved' ? 'text-[#0070d1]' : 'invisible'}`} />
                                    </label>

                                    <label className={`
                                        relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors
                                        ${campaign.audience_type === 'all' ? 'border-[#0070d1] bg-[#eef7ff] ring-1 ring-[#0070d1]/20' : 'border-gray-200 bg-white hover:bg-gray-50'}
                                    `}>
                                        <input
                                            type="radio"
                                            name="audience"
                                            className="sr-only"
                                            checked={campaign.audience_type === 'all'}
                                            onChange={() => setCampaign({ ...campaign, audience_type: 'all', audience_tag: '' })}
                                        />
                                        <span className="flex flex-1">
                                            <span className="flex flex-col">
                                                <span className="block text-sm font-semibold text-gray-950">All Contacts <span className="text-xs font-normal text-gray-400">(includes synced)</span></span>
                                                <span className="mt-1 flex items-center text-sm text-gray-500">
                                                    <Users className="h-4 w-4 mr-1" />
                                                    {isLoading.contacts ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                                                    {contacts.length} total contacts
                                                </span>
                                            </span>
                                        </span>
                                        <Check className={`h-5 w-5 ${campaign.audience_type === 'all' ? 'text-[#0070d1]' : 'invisible'}`} />
                                    </label>

                                    <label className={`
                                        relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors
                                        ${campaign.audience_type === 'CSV_UPLOAD' ? 'border-[#0070d1] bg-[#eef7ff] ring-1 ring-[#0070d1]/20' : 'border-gray-200 bg-white hover:bg-gray-50'}
                                    `}>
                                        <input
                                            type="radio"
                                            name="audience"
                                            className="sr-only"
                                            checked={campaign.audience_type === 'CSV_UPLOAD'}
                                            onChange={() => setCampaign({ ...campaign, audience_type: 'CSV_UPLOAD', audience_tag: 'CSV_UPLOAD' })}
                                        />
                                        <span className="flex flex-1">
                                            <span className="flex flex-col">
                                                <span className="block text-sm font-semibold text-gray-950">Upload CSV File</span>
                                                <span className="mt-1 flex items-center text-sm text-gray-500">
                                                    <FileText className="h-4 w-4 mr-1" />
                                                    {csvData ? `${csvData.length} contacts loaded` : 'Custom File Upload'}
                                                </span>
                                            </span>
                                        </span>
                                        <Check className={`h-5 w-5 ${campaign.audience_type === 'CSV_UPLOAD' ? 'text-[#0070d1]' : 'invisible'}`} />
                                    </label>

                                    {isLoading.tags ? (
                                        <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-center text-gray-400">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        </div>
                                    ) : tags.map((tag) => {
                                        const tagCount = contacts.filter(c => Array.isArray(c.tags) && c.tags.includes(tag)).length;
                                        return (
                                            <label key={tag} className={`
                                                relative flex cursor-pointer rounded-lg border p-4 focus:outline-none transition-colors
                                                ${campaign.audience_type === 'tag' && campaign.audience_tag === tag ? 'border-[#0070d1] bg-[#eef7ff] ring-1 ring-[#0070d1]/20' : 'border-gray-200 bg-white hover:bg-gray-50'}
                                            `}>
                                                <input
                                                    type="radio"
                                                    name="audience"
                                                    className="sr-only"
                                                    checked={campaign.audience_type === 'tag' && campaign.audience_tag === tag}
                                                    onChange={() => setCampaign({ ...campaign, audience_type: 'tag', audience_tag: tag })}
                                                />
                                                <span className="flex flex-1">
                                                    <span className="flex flex-col">
                                                        <span className="block text-sm font-semibold text-gray-950">{tag}</span>
                                                        <span className="mt-1 flex items-center text-sm text-gray-500">
                                                            <Users className="h-4 w-4 mr-1" />
                                                            {tagCount} contacts
                                                        </span>
                                                    </span>
                                                </span>
                                                <Check className={`h-5 w-5 ${campaign.audience_type === 'tag' && campaign.audience_tag === tag ? 'text-[#0070d1]' : 'invisible'}`} />
                                            </label>
                                        )
                                    })}

                                    {campaign.audience_type === 'CSV_UPLOAD' && (
                                        <div className="mt-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition-colors hover:border-[#0070d1] lg:col-span-2">
                                            <input type="file" accept=".csv" className="hidden" id="csv-upload" onChange={handleFileUpload} />
                                            <label htmlFor="csv-upload" className="cursor-pointer">
                                                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef7ff] text-[#0064b7]">
                                                    <FileText className="h-6 w-6" />
                                                </div>
                                                <span className="text-lg font-bold text-[#0064b7] hover:text-[#005ca8]">Click here to upload CSV</span>
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

                                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50">
                                    <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
                                        <h3 className="text-sm font-semibold text-gray-800">Preview Audience</h3>
                                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">{filteredContacts.length} contacts</span>
                                    </div>
                                    <div className="space-y-2 p-4">
                                        {filteredContacts.slice(0, 5).map((c, i) => (
                                            <div key={c.id || i} className="flex items-center justify-between gap-4 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-gray-100">
                                                <span className="truncate font-semibold text-gray-900">{c.custom_name || c.name || 'Unknown'}</span>
                                                <span className="shrink-0 font-mono text-xs text-gray-500">{c.phone || c.wa_id}</span>
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
                            <div data-tour="broadcast-template" className="mx-auto grid max-w-5xl grid-cols-1 gap-8 p-6 md:grid-cols-2 lg:p-8">
                                <div>
                                    <h2 className="text-lg font-medium text-gray-900 mb-4">Select Template</h2>
                                    {isLoading.templates ? (
                                        <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>
                                    ) : (
                                        <div className="space-y-3 h-[600px] overflow-y-auto pr-2">
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
                                    {renderLivePreview()}
                                </div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 p-6 md:grid-cols-2 lg:p-8">
                                <div>
                                    {renderLivePreview()}
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

                        {currentStep === 5 && (
                            <div data-tour="broadcast-cost" className="mx-auto max-w-lg space-y-6 p-6 text-center lg:p-8">
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

                                <div className={`rounded-xl border p-4 text-left ${billingEstimate?.can_launch ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
                                    }`}>
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Wallet className={`h-4 w-4 ${billingEstimate?.can_launch ? 'text-green-700' : 'text-amber-700'}`} />
                                            <h3 className={`text-sm font-bold ${billingEstimate?.can_launch ? 'text-green-950' : 'text-amber-950'}`}>
                                                Billing estimate
                                            </h3>
                                        </div>
                                        {isEstimating && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                                    </div>

                                    {estimateError ? (
                                        <p className="text-sm text-red-700">{estimateError}</p>
                                    ) : billingEstimate ? (
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Template category</span>
                                                <span className="font-semibold capitalize text-gray-950">{billingEstimate.category}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Recipients</span>
                                                <span className="font-semibold text-gray-950">{billingEstimate.audience_count}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Rate</span>
                                                <span className="font-semibold text-gray-950">{formatINRFromPaise(billingEstimate.rate_paise)} / message</span>
                                            </div>
                                            <div className="flex justify-between border-t border-black/10 pt-2">
                                                <span className="font-semibold text-gray-700">Estimated cost</span>
                                                <span className="font-bold text-gray-950">{formatINRFromPaise(billingEstimate.estimated_cost_paise)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Wallet balance</span>
                                                <span className={`font-semibold ${billingEstimate.enough_wallet ? 'text-green-700' : 'text-red-700'}`}>
                                                    {formatINRFromPaise(billingEstimate.wallet_balance_paise)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">After launch</span>
                                                <span className={`font-semibold ${billingEstimate.wallet_after_paise >= 0 ? 'text-gray-950' : 'text-red-700'}`}>
                                                    {formatINRFromPaise(billingEstimate.wallet_after_paise)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Plan broadcasts</span>
                                                <span className={`font-semibold ${billingEstimate.plan?.allowed ? 'text-gray-950' : 'text-red-700'}`}>
                                                    {billingEstimate.plan?.broadcasts_per_month < 0
                                                        ? 'Unlimited'
                                                        : `${billingEstimate.plan?.broadcasts_used_this_month || 0}/${billingEstimate.plan?.broadcasts_per_month || 0} used`}
                                                </span>
                                            </div>
                                            {!billingEstimate.enough_wallet && (
                                                <p className="rounded-lg bg-white/70 p-3 text-xs font-medium leading-5 text-red-700">
                                                    Recharge wallet before launching. Is campaign ke liye {formatINRFromPaise(billingEstimate.estimated_cost_paise - billingEstimate.wallet_balance_paise)} aur chahiye.
                                                </p>
                                            )}
                                            {!billingEstimate.plan?.allowed && (
                                                <p className="rounded-lg bg-white/70 p-3 text-xs font-medium leading-5 text-red-700">
                                                    Monthly broadcast limit complete ho gaya hai. Plan upgrade required.
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-600">Estimate loading...</p>
                                    )}
                                </div>

                                <button
                                    data-tour="broadcast-send"
                                    disabled={isSending || isEstimating || (billingEstimate && !billingEstimate.can_launch)}
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

                        {currentStep < 5 && (
                            <button
                                onClick={handleNext}
                                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800"
                            >
                                Next Step <ArrowRight className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
