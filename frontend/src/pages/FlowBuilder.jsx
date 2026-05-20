import { useState, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Play, Copy, Pause, TrendingUp, Zap, Activity, X, LayoutTemplate, Star, Search, Sparkles, Clock, Layers, CheckCircle2, Smartphone, ShieldCheck, QrCode, Info } from 'lucide-react';
import axios from 'axios';
import FlowEditor from '../components/flow-builder/FlowEditor';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { FLOW_TEMPLATE_CATEGORIES, FLOW_TEMPLATES, buildFlowFromTemplate } from '../components/flow-builder/flowTemplates';

export default function FlowBuilder() {
    const { session } = useAuth();
    const { alertDialog, confirmDialog } = useDialog();
    const [flows, setFlows] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingFlow, setEditingFlow] = useState(null);
    const [newFlowName, setNewFlowName] = useState('');
    const [newFlowDescription, setNewFlowDescription] = useState('');
    const [newFlowAccountScope, setNewFlowAccountScope] = useState('all');
    const [newFlowAccountIds, setNewFlowAccountIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [runsModalFlow, setRunsModalFlow] = useState(null);
    const [flowRuns, setFlowRuns] = useState([]);
    const [runsLoading, setRunsLoading] = useState(false);
    const [showTemplatesModal, setShowTemplatesModal] = useState(false);
    const [templateQuery, setTemplateQuery] = useState('');
    const [templateCategory, setTemplateCategory] = useState('All');
    const [selectedTemplate, setSelectedTemplate] = useState(FLOW_TEMPLATES[0]);
    const [templateDraft, setTemplateDraft] = useState(() => getDefaultTemplateDraft(FLOW_TEMPLATES[0]));
    const [templateStarStats, setTemplateStarStats] = useState({});
    const [waAccounts, setWaAccounts] = useState([]);
    const [selectedWaAccount, setSelectedWaAccount] = useState(() => localStorage.getItem('selected_wa_account_id') || 'All');

    const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

    const filteredTemplates = useMemo(() => {
        const query = templateQuery.trim().toLowerCase();
        return FLOW_TEMPLATES
            .filter(template => templateCategory === 'All' || template.category === templateCategory)
            .filter(template => {
                if (!query) return true;
                return [template.name, template.description, template.bestFor, template.category].some(value =>
                    String(value || '').toLowerCase().includes(query)
                );
            })
            .sort((a, b) => getTemplateStars(b, templateStarStats) - getTemplateStars(a, templateStarStats));
    }, [templateStarStats, templateCategory, templateQuery]);

    const handleSelectTemplate = (template) => {
        setSelectedTemplate(template);
        setTemplateDraft(getDefaultTemplateDraft(template));
    };

    const fetchTemplateStars = async () => {
        if (!session?.access_token) return;
        try {
            const res = await axios.get(`${API_URL}/api/flow-template-stars`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            setTemplateStarStats(res.data || {});
        } catch (error) {
            console.error('Failed to fetch template stars:', error);
        }
    };

    const toggleTemplateStar = async (templateId) => {
        const previous = templateStarStats;
        const current = previous[templateId] || { stars: 0, starred: false };
        const optimistic = {
            ...previous,
            [templateId]: {
                stars: Math.max(0, current.stars + (current.starred ? -1 : 1)),
                starred: !current.starred,
            }
        };
        setTemplateStarStats(optimistic);

        try {
            const res = await axios.post(`${API_URL}/api/flow-template-stars/${templateId}`, {}, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setTemplateStarStats(prev => ({
                ...prev,
                [templateId]: { stars: res.data?.stars || 0, starred: res.data?.starred === true }
            }));
        } catch (error) {
            console.error('Failed to update template star:', error);
            setTemplateStarStats(previous);
            alertDialog(error?.response?.data?.error || 'Could not update template star', { title: 'Template update failed', tone: 'danger' });
        }
    };

    useEffect(() => {
        if (session?.access_token) {
            fetchFlows();
            fetchTemplateStars();
            fetchWaAccounts();
        }
    }, [session]);

    useEffect(() => {
        const handleAccountChange = (event) => {
            setSelectedWaAccount(event?.detail?.accountId || localStorage.getItem('selected_wa_account_id') || 'All');
        };
        window.addEventListener('selected-wa-account-change', handleAccountChange);
        return () => window.removeEventListener('selected-wa-account-change', handleAccountChange);
    }, []);

    const fetchFlows = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/api/flows`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows(res.data);
        } catch (error) {
            console.error('Failed to fetch flows:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFlow = async () => {
        if (!newFlowName.trim()) return;

        const newFlow = {
            name: newFlowName,
            description: newFlowDescription,
            status: 'draft',
            triggers: [],
            wa_account_scope: newFlowAccountScope,
            wa_account_ids: newFlowAccountScope === 'selected' ? newFlowAccountIds : [],
            nodes: [],
            edges: [],
        };

        try {
            const res = await axios.post(`${API_URL}/api/flows`, newFlow, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows([res.data, ...flows]);
            setShowCreateModal(false);
            setNewFlowName('');
            setNewFlowDescription('');
            setNewFlowAccountScope('all');
            setNewFlowAccountIds([]);
            setEditingFlow(res.data);
        } catch (error) {
            console.error('Failed to create flow', error);
            alertDialog('Error creating flow', { title: 'Create flow failed', tone: 'danger' });
        }
    };

    const handleDeleteFlow = async (id) => {
        const confirmed = await confirmDialog('Are you sure you want to delete this flow? This cannot be undone.', {
            title: 'Delete flow',
            tone: 'danger',
            confirmLabel: 'Delete flow',
        });
        if (!confirmed) return;

        try {
            await axios.delete(`${API_URL}/api/flows/${id}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows(flows.filter(f => f.id !== id));
        } catch (error) {
            console.error('Failed to delete flow', error);
        }
    };

    const handleDuplicateFlow = async (flow) => {
        const duplicate = {
            name: `${flow.name} (Copy)`,
            description: flow.description,
            status: 'draft',
            triggers: flow.triggers,
            wa_account_scope: flow.wa_account_scope || 'all',
            wa_account_ids: Array.isArray(flow.wa_account_ids) ? flow.wa_account_ids : [],
            nodes: flow.nodes,
            edges: flow.edges,
        };
        try {
            const res = await axios.post(`${API_URL}/api/flows`, duplicate, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows([res.data, ...flows]);
        } catch (error) {
            console.error('Failed to duplicate flow', error);
        }
    };

    const toggleFlowStatus = async (flow) => {
        try {
            if (flow.status === 'active') {
                const res = await axios.put(`${API_URL}/api/flows/${flow.id}`, { status: 'paused' }, {
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                });
                setFlows(flows.map(f => f.id === flow.id ? res.data : f));
            } else {
                const res = await axios.post(`${API_URL}/api/flows/${flow.id}/publish`, {}, {
                    headers: { 'Authorization': `Bearer ${session?.access_token}` }
                });
                setFlows(flows.map(f => f.id === flow.id ? res.data.flow : f));
            }
        } catch (error) {
            const details = error?.response?.data?.validation?.errors || [error?.response?.data?.error || 'Failed to update status'];
            alertDialog(details.join('\n'), { title: 'Could not update flow', tone: 'danger' });
        }
    };

    const fetchWaAccounts = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/whatsapp/accounts`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setWaAccounts(Array.isArray(res.data) ? res.data : []);
        } catch (error) {
            console.error('Failed to fetch WhatsApp accounts:', error);
            setWaAccounts([]);
        }
    };

    const getAccountSwitchKey = (account) => account?.display_phone_number || account?.phone_number_id || account?.id || 'All';
    const selectedAccount = selectedWaAccount === 'All'
        ? null
        : waAccounts.find(account => String(getAccountSwitchKey(account)) === String(selectedWaAccount));
    const metaAccounts = waAccounts.filter(account => account.whatsapp_business_account_id);
    const qrAccounts = waAccounts.filter(account => !account.whatsapp_business_account_id);

    const handleCreateFromTemplate = async () => {
        if (!selectedTemplate) return;
        const newFlow = buildFlowFromTemplate(selectedTemplate, templateDraft);

        try {
            const res = await axios.post(`${API_URL}/api/flows`, newFlow, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlows([res.data, ...flows]);
            setShowTemplatesModal(false);
            setEditingFlow(res.data);
        } catch (error) {
            console.error('Failed to create flow from template', error);
            alertDialog('Error creating template flow', { title: 'Template flow failed', tone: 'danger' });
        }
    };

    const openRunsModal = async (flow) => {
        setRunsModalFlow(flow);
        setRunsLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/flows/${flow.id}/runs`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            setFlowRuns(res.data || []);
        } catch (error) {
            console.error('Failed to load flow runs:', error);
            setFlowRuns([]);
        } finally {
            setRunsLoading(false);
        }
    };

    if (editingFlow) {
        return <FlowEditor flow={editingFlow} waAccounts={waAccounts} onClose={() => { setEditingFlow(null); fetchFlows(); }} />;
    }

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Flow Builder</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Create automated message flows for your WhatsApp automation
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowTemplatesModal(true)}
                        className="fp-button-secondary"
                    >
                        <LayoutTemplate className="h-4 w-4" />
                        Flow Templates
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="fp-button-primary"
                    >
                        <Plus className="h-4 w-4" />
                        Create Flow
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                            <Info className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-blue-950">Which number will this flow run on?</h2>
                            <p className="mt-1 text-sm leading-6 text-blue-900">
                                Har flow ko all connected numbers ya selected WhatsApp numbers par run kar sakte hain. Customer jis number par message bhejta hai, reply usi receiving number se jayega.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span className="rounded-full bg-white px-3 py-1 font-semibold text-blue-800 ring-1 ring-blue-200">
                                    Current switch: {selectedAccount ? (selectedAccount.display_phone_number || selectedAccount.phone_number_id || selectedAccount.name) : 'All connected accounts'}
                                </span>
                                <span className="rounded-full bg-white px-3 py-1 text-blue-700 ring-1 ring-blue-200">
                                    {waAccounts.length} connected number(s)
                                </span>
                                <span className="rounded-full bg-white px-3 py-1 text-blue-700 ring-1 ring-blue-200">
                                    Duplicate trigger protection active
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-950">Connected access types</h2>
                        <Smartphone className="h-4 w-4 text-gray-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-green-800">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Meta API
                            </div>
                            <p className="mt-1 text-2xl font-bold text-green-900">{metaAccounts.length}</p>
                            <p className="text-[11px] leading-4 text-green-800">Templates, broadcasts, profile sync, stable webhooks.</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                                <QrCode className="h-3.5 w-3.5" />
                                QR Session
                            </div>
                            <p className="mt-1 text-2xl font-bold text-amber-900">{qrAccounts.length}</p>
                            <p className="text-[11px] leading-4 text-amber-800">Chats and flow replies only while session stays connected.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Total Flows</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">{flows.length}</p>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg">
                            <Zap className="h-6 w-6 text-blue-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Active Flows</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {flows.filter(f => f.status === 'active').length}
                            </p>
                        </div>
                        <div className="p-3 bg-green-50 rounded-lg">
                            <Play className="h-6 w-6 text-green-600" />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-500">Messages Sent</p>
                            <p className="text-2xl font-bold text-gray-900 mt-1">
                                {flows.reduce((sum, f) => sum + (f.messagesSent || 0), 0).toLocaleString()}
                            </p>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg">
                            <TrendingUp className="h-6 w-6 text-purple-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Flows List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {flows.map(flow => (
                    <div key={flow.id} className="flex flex-col bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-shadow">
                        <div className="flex-1 p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-900 mb-1">{flow.name}</h3>
                                    <p className="text-sm text-gray-500 line-clamp-2">{flow.description}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => toggleFlowStatus(flow)}
                                        className={`p-1.5 rounded-lg border ${flow.status === 'active' ? 'text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100' : 'text-green-600 border-green-200 bg-green-50 hover:bg-green-100'}`}
                                        title={flow.status === 'active' ? 'Pause Flow' : 'Activate Flow'}
                                    >
                                        {flow.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                    </button>
                                    <button
                                        onClick={() => handleDuplicateFlow(flow)}
                                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg flex items-center justify-center"
                                        title="Duplicate"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteFlow(flow.id)}
                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500">Status</span>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${flow.status === 'active'
                                            ? 'bg-green-50 text-green-700 border border-green-200'
                                            : 'bg-gray-50 text-gray-600 border border-gray-200'
                                        }`}>
                                        {flow.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500">Nodes</span>
                                    <span className="font-medium text-gray-900">{Array.isArray(flow.nodes) ? flow.nodes.length : 0}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500">Messages Sent</span>
                                    <span className="font-medium text-gray-900">{(flow.messagesSent || 0).toLocaleString()}</span>
                                </div>
                                {flow.triggers?.length > 0 && (
                                    <div className="pt-2 border-t border-gray-100">
                                        <div className="text-xs text-gray-500 mb-1">Triggers:</div>
                                        <div className="flex flex-wrap gap-1">
                                            {flow.triggers.map((trigger, i) => (
                                                <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded">
                                                    {trigger}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="pt-2 border-t border-gray-100">
                                    <div className="text-xs text-gray-500 mb-1">Runs on:</div>
                                    <div className="flex flex-wrap gap-1">
                                        {getFlowAccountBadges(flow, waAccounts).map((badge) => (
                                            <span key={badge.key} className={`px-2 py-0.5 text-xs rounded ${badge.className}`}>
                                                {badge.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                            <button
                                onClick={() => setEditingFlow(flow)}
                                className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                            >
                                <Edit2 className="h-4 w-4" />
                                Edit Flow
                            </button>
                            <button
                                onClick={() => openRunsModal(flow)}
                                className="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center"
                                title="Run logs"
                            >
                                <Activity className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {showTemplatesModal && (
                <TemplateGalleryModal
                    templates={filteredTemplates}
                    categories={FLOW_TEMPLATE_CATEGORIES}
                    selectedTemplate={selectedTemplate}
                    templateDraft={templateDraft}
                    templateStarStats={templateStarStats}
                    query={templateQuery}
                    category={templateCategory}
                    onQueryChange={setTemplateQuery}
                    onCategoryChange={setTemplateCategory}
                    onSelectTemplate={handleSelectTemplate}
                    onDraftChange={setTemplateDraft}
                    onToggleStar={toggleTemplateStar}
                    onClose={() => setShowTemplatesModal(false)}
                    onUseTemplate={handleCreateFromTemplate}
                />
            )}

            {runsModalFlow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Flow Runs</h2>
                                <p className="text-sm text-gray-500">{runsModalFlow.name}</p>
                            </div>
                            <button
                                onClick={() => { setRunsModalFlow(null); setFlowRuns([]); }}
                                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto p-5">
                            {runsLoading ? (
                                <div className="py-10 text-center text-sm text-gray-500">Loading runs...</div>
                            ) : flowRuns.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                                    No runs yet. Send a matching WhatsApp keyword to trigger this flow.
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-lg border border-gray-200">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                        <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold">Started</th>
                                                <th className="px-4 py-3 text-left font-semibold">Status</th>
                                                <th className="px-4 py-3 text-left font-semibold">Conversation</th>
                                                <th className="px-4 py-3 text-left font-semibold">Error</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {flowRuns.map(run => (
                                                <tr key={run.id}>
                                                    <td className="px-4 py-3 text-gray-700">{run.started_at ? new Date(run.started_at).toLocaleString() : '-'}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                                            run.status === 'completed' ? 'bg-green-50 text-green-700' :
                                                            run.status === 'failed' ? 'bg-red-50 text-red-700' :
                                                            'bg-blue-50 text-blue-700'
                                                        }`}>
                                                            {run.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{run.conversation_id}</td>
                                                    <td className="px-4 py-3 text-red-600">{run.error_message || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Flow Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-lg w-full">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-xl font-bold text-gray-900">Create New Flow</h2>
                            <p className="text-sm text-gray-500 mt-1">Set up a new automation flow for your WhatsApp</p>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Flow Name</label>
                                <input
                                    type="text"
                                    value={newFlowName}
                                    onChange={(e) => setNewFlowName(e.target.value)}
                                    placeholder="e.g., Welcome Flow"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                                <textarea
                                    value={newFlowDescription}
                                    onChange={(e) => setNewFlowDescription(e.target.value)}
                                    placeholder="What does this flow do?"
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>

                            <FlowAccountSelector
                                accounts={waAccounts}
                                scope={newFlowAccountScope}
                                selectedIds={newFlowAccountIds}
                                onScopeChange={setNewFlowAccountScope}
                                onSelectedIdsChange={setNewFlowAccountIds}
                            />
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setNewFlowName('');
                                    setNewFlowDescription('');
                                    setNewFlowAccountScope('all');
                                    setNewFlowAccountIds([]);
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateFlow}
                                disabled={!newFlowName.trim() || (newFlowAccountScope === 'selected' && newFlowAccountIds.length === 0)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                Create Flow
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function FlowAccountSelector({ accounts, scope, selectedIds, onScopeChange, onSelectedIdsChange }) {
    const selectedSet = new Set(selectedIds || []);

    const toggleAccount = (id) => {
        onSelectedIdsChange(
            selectedSet.has(id)
                ? selectedIds.filter((item) => item !== id)
                : [...selectedIds, id]
        );
    };

    return (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <label className="block text-sm font-semibold text-gray-800">Run this flow on</label>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                    type="button"
                    onClick={() => onScopeChange('all')}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${scope === 'all' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    All numbers
                    <span className="mt-1 block text-xs font-normal text-gray-500">Any connected number can trigger it.</span>
                </button>
                <button
                    type="button"
                    onClick={() => onScopeChange('selected')}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold ${scope === 'selected' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                    Selected numbers
                    <span className="mt-1 block text-xs font-normal text-gray-500">Only chosen accounts can trigger it.</span>
                </button>
            </div>

            {scope === 'selected' && (
                <div className="mt-3 space-y-2">
                    {accounts.length === 0 ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            Connect a WhatsApp account first, or switch to all numbers.
                        </div>
                    ) : accounts.map((account) => {
                        const isMeta = Boolean(account.whatsapp_business_account_id);
                        return (
                            <label key={account.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50">
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-gray-900">{getAccountLabel(account)}</span>
                                    <span className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${isMeta ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                        {isMeta ? <ShieldCheck className="h-3 w-3" /> : <QrCode className="h-3 w-3" />}
                                        {isMeta ? 'Meta API' : 'QR Session'}
                                    </span>
                                </span>
                                <input
                                    type="checkbox"
                                    checked={selectedSet.has(account.id)}
                                    onChange={() => toggleAccount(account.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function getAccountLabel(account) {
    return account?.display_phone_number || account?.phone_number_id || account?.name || 'WhatsApp account';
}

function getFlowAccountBadges(flow, accounts) {
    const scope = flow?.wa_account_scope || 'all';
    if (scope !== 'selected') {
        return [{ key: 'all', label: 'All connected numbers', className: 'bg-blue-50 text-blue-700' }];
    }

    const ids = Array.isArray(flow?.wa_account_ids) ? flow.wa_account_ids : [];
    if (ids.length === 0) {
        return [{ key: 'none', label: 'No number selected', className: 'bg-red-50 text-red-700' }];
    }

    return ids.map((id) => {
        const account = accounts.find((item) => item.id === id);
        const isMeta = Boolean(account?.whatsapp_business_account_id);
        return {
            key: id,
            label: account ? `${getAccountLabel(account)} ${isMeta ? 'Meta' : 'QR'}` : `Account ${id.slice(0, 6)}`,
            className: isMeta ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
        };
    });
}

function TemplateGalleryModal({
    templates,
    categories,
    selectedTemplate,
    templateDraft,
    templateStarStats,
    query,
    category,
    onQueryChange,
    onCategoryChange,
    onSelectTemplate,
    onDraftChange,
    onToggleStar,
    onClose,
    onUseTemplate,
}) {
    const preview = selectedTemplate?.preview || { nodes: [], edges: [] };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex h-[88vh] w-full max-w-7xl overflow-hidden rounded-lg border border-gray-200 bg-white">
                <div className="flex w-[420px] flex-col border-r border-gray-200 bg-white">
                    <div className="border-b border-gray-200 bg-white p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold text-[#128C7E]">
                                    <Sparkles className="h-4 w-4" />
                                    Flow Templates
                                </div>
                                <h2 className="mt-1 text-2xl font-light text-black">Start from a proven flow</h2>
                                <p className="mt-1 text-sm leading-5 text-gray-500">Choose a workflow, fill details, and generate a ready-to-edit draft.</p>
                            </div>
                            <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-black">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="relative mt-4">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={query}
                                onChange={(event) => onQueryChange(event.target.value)}
                                placeholder="Search sales, support, booking..."
                                className="fp-input h-10 pl-9"
                            />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {categories.map(item => (
                                <button
                                    key={item}
                                    onClick={() => onCategoryChange(item)}
                                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                                        category === item ? 'bg-black text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-[#f5f7fa] p-3">
                        <div className="space-y-2">
                            {templates.map(template => {
                                const selected = selectedTemplate?.id === template.id;
                                const starred = Boolean(templateStarStats[template.id]?.starred);

                                return (
                                    <button
                                        key={template.id}
                                        type="button"
                                        onClick={() => onSelectTemplate(template)}
                                        className={`w-full rounded-lg border bg-white p-4 text-left transition-colors ${
                                            selected ? 'border-[#25D366] ring-2 ring-[#25D366]/10' : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="truncate text-sm font-semibold text-gray-950">{template.name}</h3>
                                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{template.category}</span>
                                                </div>
                                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">{template.description}</p>
                                            </div>
                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${starred ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-500'}`}>
                                                <Star className={`h-3.5 w-3.5 ${starred ? 'fill-current' : ''}`} />
                                                {getTemplateStars(template, templateStarStats)}
                                            </span>
                                        </div>
                                        <div className="mt-3 flex items-center gap-3 text-[11px] text-gray-500">
                                            <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> {template.preview.nodes.length} nodes</span>
                                            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {template.minutes} min</span>
                                            <span>{template.difficulty}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="border-b border-gray-200 px-6 py-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-semibold text-black">{selectedTemplate.name}</h2>
                                    <span className="rounded-full bg-[#25D366]/10 px-2 py-1 text-xs font-semibold text-[#128C7E]">{selectedTemplate.category}</span>
                                </div>
                                <p className="mt-1 max-w-2xl text-sm text-gray-500">{selectedTemplate.bestFor}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="hidden rounded-lg border border-gray-200 bg-[#f8faf9] px-3 py-2 text-xs text-gray-600 lg:block">
                                    <div className="font-semibold text-gray-900">{selectedTemplate.preview.nodes.length} nodes</div>
                                    Ready-to-edit draft
                                </div>
                                <button
                                    onClick={() => onToggleStar(selectedTemplate.id)}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                                        templateStarStats[selectedTemplate.id]?.starred
                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <Star className={`h-4 w-4 ${templateStarStats[selectedTemplate.id]?.starred ? 'fill-current' : ''}`} />
                                    Star · {getTemplateStars(selectedTemplate, templateStarStats)}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] bg-white">
                        <div className="overflow-y-auto bg-white p-6">
                            <div className="rounded-lg border border-gray-200 bg-white">
                                <div className="border-b border-gray-100 px-4 py-3">
                                    <h3 className="text-sm font-semibold text-gray-900">Template Preview</h3>
                                    <p className="text-xs text-gray-500">This draft will be generated in the editor.</p>
                                </div>
                                <div className="h-[430px] overflow-hidden bg-[#f6f7f8]">
                                    <TemplatePreviewCanvas preview={preview} />
                                </div>
                            </div>
                        </div>

                        <div className="border-l border-gray-200 bg-[#f8faf9] p-5">
                            <h3 className="text-sm font-semibold text-gray-900">Fill Details</h3>
                            <p className="mt-1 text-xs leading-5 text-gray-500">These values replace placeholders inside messages and node settings.</p>

                            <div className="mt-4 space-y-4">
                                {selectedTemplate.fields.map(field => (
                                    <label key={field.key} className="block">
                                        <span className="mb-1.5 block text-xs font-semibold text-gray-700">{field.label}</span>
                                        <input
                                            value={templateDraft[field.key] || ''}
                                            onChange={(event) => onDraftChange(prev => ({ ...prev, [field.key]: event.target.value }))}
                                            className="fp-input h-10"
                                        />
                                    </label>
                                ))}
                            </div>

                            <div className="mt-5 rounded-lg border border-gray-200 bg-white p-3 text-xs leading-5 text-gray-600">
                                <div className="mb-2 flex items-center gap-2 font-semibold text-gray-900">
                                    <CheckCircle2 className="h-4 w-4 text-[#128C7E]" />
                                    What happens next
                                </div>
                                Created as a draft. You can edit every node, test it, then publish when ready.
                            </div>

                            <button
                                onClick={onUseTemplate}
                                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white hover:bg-[#1fb85a]"
                            >
                                <LayoutTemplate className="h-4 w-4" />
                                Use Template
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function getDefaultTemplateDraft(template) {
    return Object.fromEntries((template?.fields || []).map(field => [field.key, field.defaultValue || '']));
}

function getTemplateStars(template, templateStarStats) {
    const realStats = templateStarStats[template.id];
    const fakeBase = template.fakeStars || 50;
    return fakeBase + (realStats?.starred ? 1 : 0);
}

function TemplatePreviewCanvas({ preview }) {
    const nodes = preview?.nodes || [];
    const edges = preview?.edges || [];
    const nodeWidth = 220;
    const nodeHeight = 72;
    const padding = 130;

    if (nodes.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No preview available
            </div>
        );
    }

    const byId = Object.fromEntries(nodes.map(item => [item.id, item]));
    const minX = Math.min(...nodes.map(item => item.position.x)) - padding;
    const minY = Math.min(...nodes.map(item => item.position.y)) - padding;
    const maxX = Math.max(...nodes.map(item => item.position.x + nodeWidth)) + padding;
    const maxY = Math.max(...nodes.map(item => item.position.y + nodeHeight)) + padding;
    const width = Math.max(maxX - minX, 640);
    const height = Math.max(maxY - minY, 420);

    return (
        <svg className="h-full w-full" viewBox={`${minX} ${minY} ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
            <defs>
                <marker id="template-preview-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#9aa4b2" />
                </marker>
                <filter id="template-preview-shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#121314" floodOpacity="0.10" />
                </filter>
            </defs>

            <rect x={minX} y={minY} width={width} height={height} fill="#f6f7f8" />
            <g opacity="0.55">
                {Array.from({ length: Math.ceil(width / 80) + 1 }).map((_, index) => (
                    <line key={`v-${index}`} x1={minX + index * 80} y1={minY} x2={minX + index * 80} y2={minY + height} stroke="#e8edf3" strokeWidth="1" />
                ))}
                {Array.from({ length: Math.ceil(height / 80) + 1 }).map((_, index) => (
                    <line key={`h-${index}`} x1={minX} y1={minY + index * 80} x2={minX + width} y2={minY + index * 80} stroke="#e8edf3" strokeWidth="1" />
                ))}
            </g>

            <g>
                {edges.map(item => {
                    const source = byId[item.source];
                    const target = byId[item.target];
                    if (!source || !target) return null;

                    const startX = source.position.x + nodeWidth / 2;
                    const startY = source.position.y + nodeHeight;
                    const endX = target.position.x + nodeWidth / 2;
                    const endY = target.position.y;
                    const midY = startY + Math.max(36, (endY - startY) / 2);

                    return (
                        <path
                            key={item.id}
                            d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                            fill="none"
                            stroke="#9aa4b2"
                            strokeWidth="2"
                            strokeDasharray="6 6"
                            markerEnd="url(#template-preview-arrow)"
                        />
                    );
                })}
            </g>

            <g>
                {nodes.map(item => {
                    const x = item.position.x;
                    const y = item.position.y;
                    const label = truncateText(getNodeLabel(item), 22);
                    const summary = truncateText(getNodeSummary(item), 34);

                    return (
                        <g key={item.id} filter="url(#template-preview-shadow)">
                            <rect x={x} y={y} width={nodeWidth} height={nodeHeight} rx="8" fill="#ffffff" stroke="#dfe6ee" />
                            <rect x={x} y={y} width={nodeWidth} height="28" rx="8" fill="#128C7E" />
                            <path d={`M ${x} ${y + 20} H ${x + nodeWidth} V ${y + 28} H ${x} Z`} fill="#128C7E" />
                            <text x={x + 12} y={y + 19} fill="#ffffff" fontSize="13" fontWeight="700">{label}</text>
                            <text x={x + 12} y={y + 52} fill="#4b5563" fontSize="12">{summary}</text>
                        </g>
                    );
                })}
            </g>

            <g>
                <rect x={minX + 24} y={minY + 24} width="118" height="30" rx="15" fill="#ffffff" stroke="#d8dee8" />
                <text x={minX + 42} y={minY + 44} fill="#6b7280" fontSize="12" fontWeight="600">Preview layout</text>
            </g>
        </svg>
    );
}

function truncateText(value, maxLength) {
    const text = String(value || '');
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function getNodeLabel(node) {
    const labels = {
        startBotFlow: 'Trigger',
        textMessage: 'Text',
        button: 'Buttons',
        userInput: 'Input',
        handoff: 'Handoff',
        end: 'End',
        ai: 'AI',
    };
    return labels[node.type] || node.type;
}

function getNodeSummary(node) {
    const config = node.data?.config || {};
    return config.message || config.headerText || config.question || config.reason || config.keywords || config.title || 'Configured block';
}
