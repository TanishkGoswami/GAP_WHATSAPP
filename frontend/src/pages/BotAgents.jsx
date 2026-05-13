import { useState, useRef, useEffect } from 'react';
import { Bot, Plus, Settings, Trash2, Power, Database, Key, FileText, Save, Brain, X, Upload, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const API_BASE = `${BACKEND_BASE}/api`;

export default function BotAgents() {
    const { session } = useAuth();
    const [agents, setAgents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [showApiSettings, setShowApiSettings] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
    const fileInputRef = useRef(null);

    const [newAgent, setNewAgent] = useState({
        name: '',
        description: '',
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        triggerKeywords: '',
        systemPrompt: '',
        knowledgeBase: [],
    });

    const [editingAgent, setEditingAgent] = useState(null);

    const [fetchError, setFetchError] = useState(null);

    // Fetch agents from API
    const fetchAgents = async () => {
        if (!session?.access_token) return;
        try {
            setIsLoading(true);
            setFetchError(null);
            const res = await fetch(`${API_BASE}/agents`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                // Transform data to match UI format
                const formatted = data.map(agent => ({
                    id: agent.id,
                    name: agent.name,
                    description: agent.description || '',
                    isActive: agent.is_active,
                    knowledgeBase: agent.knowledge_base || [],
                    triggerKeywords: agent.trigger_keywords || [],
                    model: agent.model || 'gpt-3.5-turbo',
                    temperature: agent.temperature || 0.7,
                    systemPrompt: agent.system_prompt || '',
                    knowledgeBaseContent: agent.knowledge_base_content || [],
                }));
                setAgents(formatted);
            } else if (res.status === 404) {
                setFetchError('Database table not found. Please run the migration first.');
            } else {
                const errData = await res.json().catch(() => ({}));
                setFetchError(errData.error || 'Failed to fetch agents');
            }
        } catch (err) {
            console.error('Failed to fetch agents:', err);
            setFetchError('Cannot connect to server. Make sure the backend is running.');
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch OpenAI settings status
    const fetchApiSettings = async () => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_BASE}/settings/openai`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setApiKeyConfigured(data.configured || data.hasEnvKey);
            }
        } catch (err) {
            console.error('Failed to fetch API settings:', err);
        }
    };

    useEffect(() => {
        if (session?.access_token) {
            fetchAgents();
            fetchApiSettings();
        }
    }, [session]);

    const handleCreateAgent = async () => {
        if (!session?.access_token) return;
        setIsSaving(true);
        try {
            const payload = {
                name: newAgent.name,
                description: newAgent.description,
                model: newAgent.model,
                temperature: newAgent.temperature,
                trigger_keywords: newAgent.triggerKeywords.split(',').map(k => k.trim()).filter(k => k),
                system_prompt: newAgent.systemPrompt,
                knowledge_base: uploadedFiles.map(f => f.name),
                knowledge_base_content: uploadedFiles.map(f => ({ name: f.name, size: f.size })),
                is_active: true
            };

            const res = await fetch(`${API_BASE}/agents`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowCreateModal(false);
                setNewAgent({ name: '', description: '', model: 'gpt-3.5-turbo', temperature: 0.7, triggerKeywords: '', systemPrompt: '', knowledgeBase: [] });
                setUploadedFiles([]);
                fetchAgents();
            } else {
                const err = await res.json().catch(() => ({}));
                const errorMsg = err.error || 'Failed to create agent';
                if (errorMsg.includes('not found') || errorMsg.includes('migration')) {
                    setFetchError(errorMsg);
                    setShowCreateModal(false);
                } else {
                    alert(errorMsg);
                }
            }
        } catch (err) {
            console.error('Create agent error:', err);
            alert('Failed to create agent. Check if the server is running.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files);
        setUploadedFiles([...uploadedFiles, ...files]);
    };

    const removeFile = (index) => {
        setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
    };

    const openEditModal = (agent) => {
        setEditingAgent({ 
            ...agent, 
            triggerKeywords: Array.isArray(agent.triggerKeywords) ? agent.triggerKeywords.join(', ') : ''
        });
        setShowEditModal(true);
    };

    const handleUpdateAgent = async () => {
        setIsSaving(true);
        try {
            const payload = {
                name: editingAgent.name,
                description: editingAgent.description,
                model: editingAgent.model,
                temperature: editingAgent.temperature,
                trigger_keywords: editingAgent.triggerKeywords.split(',').map(k => k.trim()).filter(k => k),
                system_prompt: editingAgent.systemPrompt,
                is_active: editingAgent.isActive
            };

            const res = await fetch(`${API_BASE}/agents/${editingAgent.id}`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setShowEditModal(false);
                setEditingAgent(null);
                fetchAgents();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to update agent');
            }
        } catch (err) {
            console.error('Update agent error:', err);
            alert('Failed to update agent');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleAgentStatus = async (id) => {
        const agent = agents.find(a => a.id === id);
        if (!agent) return;

        try {
            const res = await fetch(`${API_BASE}/agents/${id}`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ is_active: !agent.isActive })
            });

            if (res.ok) {
                setAgents(agents.map(a =>
                    a.id === id ? { ...a, isActive: !a.isActive } : a
                ));
            }
        } catch (err) {
            console.error('Toggle agent error:', err);
        }
    };

    const deleteAgent = async (id) => {
        if (!confirm('Are you sure you want to delete this agent?')) return;

        try {
            const res = await fetch(`${API_BASE}/agents/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });

            if (res.ok) {
                setAgents(agents.filter(agent => agent.id !== id));
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to delete agent');
            }
        } catch (err) {
            console.error('Delete agent error:', err);
            alert('Failed to delete agent');
        }
    };

    const saveApiKey = async () => {
        if (!apiKey.trim()) {
            alert('Please enter an API key');
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE}/settings/openai`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ api_key: apiKey })
            });

            if (res.ok) {
                setShowApiSettings(false);
                setApiKey('');
                setApiKeyConfigured(true);
                alert('API key saved successfully!');
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to save API key');
            }
        } catch (err) {
            console.error('Save API key error:', err);
            alert('Failed to save API key');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Bot Agents</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Create AI-powered agents with custom knowledge bases for automated customer interactions
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowApiSettings(true)}
                        className={`flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm font-medium ${
                            apiKeyConfigured 
                                ? 'border-green-300 text-green-700 bg-green-50' 
                                : 'border-gray-300 text-gray-700'
                        }`}
                    >
                        <Key className="h-4 w-4" />
                        API Settings
                        {apiKeyConfigured && <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded">✓</span>}
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                    >
                        <Plus className="h-4 w-4" />
                        Create Agent
                    </button>
                </div>
            </div>

            {/* API Key Warning Banner */}
            {!apiKeyConfigured && !isLoading && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                    <Key className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <h3 className="font-medium text-yellow-800">OpenAI API Key Not Configured</h3>
                        <p className="text-sm text-yellow-700 mt-1">
                            Your AI bots won't be able to respond to messages without an API key. 
                            Click "API Settings" to add your OpenAI API key.
                        </p>
                    </div>
                    <button 
                        onClick={() => setShowApiSettings(true)}
                        className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700"
                    >
                        Configure
                    </button>
                </div>
            )}

            {/* Error Banner */}
            {fetchError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <X className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <h3 className="font-medium text-red-800">Error Loading Agents</h3>
                        <p className="text-sm text-red-700 mt-1">{fetchError}</p>
                    </div>
                    <button 
                        onClick={() => { setFetchError(null); fetchAgents(); }}
                        className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Agents Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {agents.map(agent => (
                    <div key={agent.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${agent.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                                    <Bot className={`h-6 w-6 ${agent.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {agent.model} • Temp: {agent.temperature}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => toggleAgentStatus(agent.id)}
                                    className={`p-1.5 rounded ${agent.isActive ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`}
                                    title={agent.isActive ? 'Disable' : 'Enable'}
                                >
                                    <Power className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => deleteAgent(agent.id)}
                                    className="p-1.5 rounded text-red-600 hover:bg-red-50"
                                    title="Delete"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <p className="text-sm text-gray-600 mb-4">{agent.description}</p>

                        <div className="space-y-3">
                            <div>
                                <div className="text-xs font-medium text-gray-500 mb-1">Trigger Keywords</div>
                                <div className="flex flex-wrap gap-1">
                                    {agent.triggerKeywords.map((keyword, i) => (
                                        <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-medium">
                                            {keyword}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="text-xs font-medium text-gray-500 mb-1">Knowledge Base ({agent.knowledgeBase?.length || 0})</div>
                                <div className="flex flex-col gap-1">
                                    {agent.knowledgeBase?.slice(0, 2).map((file, i) => (
                                        <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
                                            <FileText className="h-3 w-3" />
                                            <span className="truncate">{file}</span>
                                        </div>
                                    ))}
                                    {agent.knowledgeBase?.length > 2 && (
                                        <span className="text-xs text-gray-400">+{agent.knowledgeBase.length - 2} more</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => openEditModal(agent)}
                            className="mt-4 w-full py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            <Settings className="h-4 w-4 inline mr-1" />
                            Configure
                        </button>
                    </div>
                ))}
            </div>

            {/* Create Agent Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Create New Bot Agent</h2>
                                <p className="text-sm text-gray-500 mt-1">Configure your AI agent's behavior and knowledge base</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                                <input
                                    type="text"
                                    value={newAgent.name}
                                    onChange={e => setNewAgent({ ...newAgent, name: e.target.value })}
                                    placeholder="e.g., Customer Support Bot"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={newAgent.description}
                                    onChange={e => setNewAgent({ ...newAgent, description: e.target.value })}
                                    placeholder="What does this agent do?"
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                                    <select
                                        value={newAgent.model}
                                        onChange={e => setNewAgent({ ...newAgent, model: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    >
                                        <option value="gpt-4">GPT-4</option>
                                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Temperature ({newAgent.temperature})</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={newAgent.temperature}
                                        onChange={e => setNewAgent({ ...newAgent, temperature: parseFloat(e.target.value) })}
                                        className="w-full"
                                    />
                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span>Precise</span>
                                        <span>Creative</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Trigger Keywords (comma separated)
                                </label>
                                <input
                                    type="text"
                                    value={newAgent.triggerKeywords}
                                    onChange={e => setNewAgent({ ...newAgent, triggerKeywords: e.target.value })}
                                    placeholder="help, support, question"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                                <p className="text-xs text-gray-500 mt-1">Agent will respond when message contains any of these keywords</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                                <textarea
                                    value={newAgent.systemPrompt}
                                    onChange={e => setNewAgent({ ...newAgent, systemPrompt: e.target.value })}
                                    placeholder="You are a helpful customer support assistant..."
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Database className="h-4 w-4 inline mr-1" />
                                    Knowledge Base
                                </label>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-500 cursor-pointer transition-colors"
                                >
                                    <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                                    <p className="text-sm text-gray-600">Click to upload files</p>
                                    <p className="text-xs text-gray-400 mt-1">Supports PDF, TXT, CSV, MD</p>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        onChange={handleFileUpload}
                                        accept=".pdf,.txt,.csv,.md"
                                        className="hidden"
                                    />
                                </div>
                                {uploadedFiles.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {uploadedFiles.map((file, i) => (
                                            <div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-200">
                                                <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-gray-500" />
                                                    <span className="text-sm text-gray-700">{file.name}</span>
                                                    <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                                                </div>
                                                <button
                                                    onClick={() => removeFile(i)}
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateAgent}
                                disabled={!newAgent.name || !newAgent.description}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Brain className="h-4 w-4" />
                                Create Agent
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Agent Modal */}
            {showEditModal && editingAgent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Configure Agent</h2>
                                <p className="text-sm text-gray-500 mt-1">{editingAgent.name}</p>
                            </div>
                            <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Name</label>
                                <input
                                    type="text"
                                    value={editingAgent.name}
                                    onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={editingAgent.description}
                                    onChange={e => setEditingAgent({ ...editingAgent, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                                    <select
                                        value={editingAgent.model}
                                        onChange={e => setEditingAgent({ ...editingAgent, model: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                    >
                                        <option value="gpt-4">GPT-4</option>
                                        <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Temperature ({editingAgent.temperature})</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={editingAgent.temperature}
                                        onChange={e => setEditingAgent({ ...editingAgent, temperature: parseFloat(e.target.value) })}
                                        className="w-full"
                                    />
                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span>Precise</span>
                                        <span>Creative</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Trigger Keywords (comma separated)
                                </label>
                                <input
                                    type="text"
                                    value={editingAgent.triggerKeywords}
                                    onChange={e => setEditingAgent({ ...editingAgent, triggerKeywords: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                                <textarea
                                    value={editingAgent.systemPrompt || ''}
                                    onChange={e => setEditingAgent({ ...editingAgent, systemPrompt: e.target.value })}
                                    rows={4}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Knowledge Base Files</label>
                                <div className="space-y-2">
                                    {editingAgent.knowledgeBase?.map((file, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded border border-gray-200">
                                            <FileText className="h-4 w-4 text-gray-500" />
                                            <span className="text-sm text-gray-700">{file}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateAgent}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-2"
                            >
                                <Save className="h-4 w-4" />
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* API Settings Modal */}
            {showApiSettings && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-lg w-full">
                        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">ChatGPT API Settings</h2>
                                <p className="text-sm text-gray-500 mt-1">Configure your OpenAI API credentials</p>
                            </div>
                            <button onClick={() => setShowApiSettings(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {apiKeyConfigured && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                    <p className="text-sm text-green-800 flex items-center gap-2">
                                        <span className="text-green-500">✓</span>
                                        <strong>API key is configured.</strong> Enter a new key below to replace it.
                                    </p>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="sk-..."
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Get your API key from{' '}
                                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                                        platform.openai.com
                                    </a>
                                </p>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
                                    <strong>Note:</strong> Your API key is stored securely and encrypted. It will only be used to make requests to OpenAI on your behalf.
                                </p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => setShowApiSettings(false)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveApiKey}
                                disabled={isSaving}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {isSaving ? 'Saving...' : 'Save Key'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
