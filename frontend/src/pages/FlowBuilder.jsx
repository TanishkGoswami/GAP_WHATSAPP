import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Play, Copy, Pause, TrendingUp, Zap } from 'lucide-react';
import axios from 'axios';
import FlowEditor from '../components/flow-builder/FlowEditor';

export default function FlowBuilder() {
    const [flows, setFlows] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingFlow, setEditingFlow] = useState(null);
    const [newFlowName, setNewFlowName] = useState('');
    const [newFlowDescription, setNewFlowDescription] = useState('');
    const [loading, setLoading] = useState(true);

    const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

    useEffect(() => {
        fetchFlows();
    }, []);

    const fetchFlows = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/api/flows`);
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
            nodes: [],
            edges: [],
        };

        try {
            const res = await axios.post(`${API_URL}/api/flows`, newFlow);
            setFlows([res.data, ...flows]);
            setShowCreateModal(false);
            setNewFlowName('');
            setNewFlowDescription('');
            setEditingFlow(res.data);
        } catch (error) {
            console.error('Failed to create flow', error);
            alert('Error creating flow');
        }
    };

    const handleDeleteFlow = async (id) => {
        if (confirm('Are you sure you want to delete this flow?')) {
            try {
                await axios.delete(`${API_URL}/api/flows/${id}`);
                setFlows(flows.filter(f => f.id !== id));
            } catch (error) {
                console.error('Failed to delete flow', error);
            }
        }
    };

    const handleDuplicateFlow = async (flow) => {
        const duplicate = {
            name: `${flow.name} (Copy)`,
            description: flow.description,
            status: 'draft',
            triggers: flow.triggers,
            nodes: flow.nodes,
            edges: flow.edges,
        };
        try {
            const res = await axios.post(`${API_URL}/api/flows`, duplicate);
            setFlows([res.data, ...flows]);
        } catch (error) {
            console.error('Failed to duplicate flow', error);
        }
    };

    const toggleFlowStatus = async (flow) => {
        const newStatus = flow.status === 'active' ? 'draft' : 'active';
        try {
            const res = await axios.put(`${API_URL}/api/flows/${flow.id}`, { status: newStatus });
            setFlows(flows.map(f => f.id === flow.id ? res.data : f));
        } catch (error) {
            console.error('Failed to update status', error);
        }
    };

    if (editingFlow) {
        return <FlowEditor flow={editingFlow} onClose={() => { setEditingFlow(null); fetchFlows(); }} />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Flow Builder</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Create automated message flows for your WhatsApp automation
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm"
                >
                    <Plus className="h-4 w-4" />
                    Create Flow
                </button>
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
                    <div key={flow.id} className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-shadow">
                        <div className="p-6">
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
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                            <button
                                onClick={() => setEditingFlow(flow)}
                                className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
                            >
                                <Edit2 className="h-4 w-4" />
                                Edit Flow
                            </button>
                        </div>
                    </div>
                ))}
            </div>

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
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setNewFlowName('');
                                    setNewFlowDescription('');
                                }}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateFlow}
                                disabled={!newFlowName.trim()}
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
