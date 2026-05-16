import { X, Save } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function NodeConfigPanel({ node, onClose, onSave }) {
    const [config, setConfig] = useState(node?.data?.config || {});

    useEffect(() => {
        setConfig(node?.data?.config || {});
    }, [node]);

    if (!node) return null;

    const handleSave = () => {
        onSave(node.id, config);
        onClose();
    };

    const updateConfig = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Configure {node.type}</h2>
                        <p className="text-xs text-blue-100 mt-0.5">Node ID: {node.id}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {renderConfigForm(node.type, config, updateConfig)}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                        <Save className="h-4 w-4" />
                        Save
                    </button>
                </div>
            </div>
        </>
    );
}

function renderConfigForm(nodeType, config, updateConfig) {
    switch (nodeType) {
        case 'startBotFlow':
            return <StartBotFlowConfig config={config} updateConfig={updateConfig} />;
        case 'textMessage':
            return <TextMessageConfig config={config} updateConfig={updateConfig} />;
        case 'image':
        case 'audio':
        case 'video':
        case 'file':
            return <MediaConfig config={config} updateConfig={updateConfig} nodeType={nodeType} />;
        case 'userInput':
            return <UserInputConfig config={config} updateConfig={updateConfig} />;
        case 'condition':
            return <ConditionConfig config={config} updateConfig={updateConfig} />;
        case 'button':
            return <ButtonConfig config={config} updateConfig={updateConfig} />;
        case 'location':
            return <LocationConfig config={config} updateConfig={updateConfig} />;
        case 'httpApi':
            return <HTTPAPIConfig config={config} updateConfig={updateConfig} />;
        case 'template':
            return <TemplateConfig config={config} updateConfig={updateConfig} />;
        case 'interactive':
            return <InteractiveListConfig config={config} updateConfig={updateConfig} />;
        case 'handoff':
            return <HandoffConfig config={config} updateConfig={updateConfig} />;
        case 'end':
            return <EndConfig config={config} updateConfig={updateConfig} />;
        default:
            return <DefaultConfig config={config} updateConfig={updateConfig} />;
    }
}

// Configuration components for each node type
function StartBotFlowConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Trigger Keywords
                </label>
                <input
                    type="text"
                    value={config.keywords || ''}
                    onChange={(e) => updateConfig('keywords', e.target.value)}
                    placeholder="Hello, Hi, Start"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Comma-separated keywords</p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Match Type
                </label>
                <div className="flex gap-3">
                    <button
                        onClick={() => updateConfig('matchType', 'exact')}
                        className={`flex-1 px-4 py-2 rounded-lg border ${config.matchType === 'exact'
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'bg-white text-gray-700 border-gray-300'
                            }`}
                    >
                        Exact Match
                    </button>
                    <button
                        onClick={() => updateConfig('matchType', 'string')}
                        className={`flex-1 px-4 py-2 rounded-lg border ${config.matchType === 'string'
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'bg-white text-gray-700 border-gray-300'
                            }`}
                    >
                        String Match
                    </button>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title
                </label>
                <input
                    type="text"
                    value={config.title || ''}
                    onChange={(e) => updateConfig('title', e.target.value)}
                    placeholder="Welcome Flow"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Add Labels
                </label>
                <input
                    type="text"
                    value={config.labels || ''}
                    onChange={(e) => updateConfig('labels', e.target.value)}
                    placeholder="new-user, welcome"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>
    );
}

function TextMessageConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message Text
                </label>
                <textarea
                    value={config.message || ''}
                    onChange={(e) => updateConfig('message', e.target.value)}
                    placeholder="Enter your message here..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 nodrag"
                    rows={6}
                    maxLength={4096}
                />
                <p className="mt-1 text-xs text-gray-500">
                    {(config.message || '').length}/4096 characters
                </p>
            </div>

            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                    Typing on Display
                </label>
                <button
                    onClick={() => updateConfig('typingDisplay', !config.typingDisplay)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.typingDisplay ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.typingDisplay ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
            </div>

            <SmartDelayConfig config={config} updateConfig={updateConfig} />
        </div>
    );
}

function HandoffConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Handoff Reason</label>
                <input
                    type="text"
                    value={config.reason || ''}
                    onChange={(e) => updateConfig('reason', e.target.value)}
                    placeholder="Customer needs a sales agent"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Message Before Handoff</label>
                <textarea
                    value={config.message || ''}
                    onChange={(e) => updateConfig('message', e.target.value)}
                    placeholder="Thanks. I am connecting you with a sales agent."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                    type="checkbox"
                    checked={config.summaryRequired !== false}
                    onChange={(e) => updateConfig('summaryRequired', e.target.checked)}
                />
                Request n8n summary
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                    type="checkbox"
                    checked={config.disableBotAfterHandoff !== false}
                    onChange={(e) => updateConfig('disableBotAfterHandoff', e.target.checked)}
                />
                Disable bot after handoff
            </label>
        </div>
    );
}

function EndConfig({ config, updateConfig }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Final Message</label>
            <textarea
                value={config.message || ''}
                onChange={(e) => updateConfig('message', e.target.value)}
                placeholder="Optional message before ending the flow"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
            />
        </div>
    );
}

function MediaConfig({ config, updateConfig, nodeType }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Method
                </label>
                <div className="flex gap-3">
                    <button
                        onClick={() => updateConfig('uploadMethod', 'custom')}
                        className={`flex-1 px-4 py-2 rounded-lg border text-sm ${config.uploadMethod === 'custom'
                                ? 'bg-purple-500 text-white border-purple-500'
                                : 'bg-white text-gray-700 border-gray-300'
                            }`}
                    >
                        Custom Field
                    </button>
                    <button
                        onClick={() => updateConfig('uploadMethod', 'upload')}
                        className={`flex-1 px-4 py-2 rounded-lg border text-sm ${config.uploadMethod === 'upload'
                                ? 'bg-purple-500 text-white border-purple-500'
                                : 'bg-white text-gray-700 border-gray-300'
                            }`}
                    >
                        Upload New
                    </button>
                </div>
            </div>

            {config.uploadMethod === 'custom' ? (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Custom Field URL
                    </label>
                    <input
                        type="text"
                        value={config.customField || ''}
                        onChange={(e) => updateConfig('customField', e.target.value)}
                        placeholder="{{imageUrl}}"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                </div>
            ) : (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        {nodeType === 'image' ? 'Image URL' :
                            nodeType === 'audio' ? 'Audio URL' :
                                nodeType === 'video' ? 'Video URL' : 'File URL'}
                    </label>
                    <input
                        type="url"
                        value={config.url || ''}
                        onChange={(e) => updateConfig('url', e.target.value)}
                        placeholder="https://example.com/media.jpg"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                </div>
            )}

            {(nodeType === 'image' || nodeType === 'video') && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Caption
                    </label>
                    <textarea
                        value={config.caption || ''}
                        onChange={(e) => updateConfig('caption', e.target.value)}
                        placeholder="Enter caption..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        rows={3}
                    />
                </div>
            )}

            <SmartDelayConfig config={config} updateConfig={updateConfig} />
        </div>
    );
}

function UserInputConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prompt Message (Optional)
                </label>
                <textarea
                    value={config.question || ''}
                    onChange={(e) => updateConfig('question', e.target.value)}
                    placeholder="Leave empty if the previous Text Message already asks the question"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Input Type
                </label>
                <select
                    value={config.inputType || 'text'}
                    onChange={(e) => updateConfig('inputType', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Save to Custom Field
                </label>
                <input
                    type="text"
                    value={config.saveToField || ''}
                    onChange={(e) => {
                        const cleaned = e.target.value
                            .replace(/^\{\{\s*/, '')
                            .replace(/\s*\}\}$/, '')
                            .replace(/[^a-zA-Z0-9_]/g, '_')
                            .toLowerCase();
                        updateConfig('saveToField', cleaned);
                    }}
                    placeholder="name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Use a simple key like <span className="font-mono">name</span>. Later messages can use <span className="font-mono">{'{{name}}'}</span>.</p>
            </div>
        </div>
    );
}

function ConditionConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Variable
                </label>
                <input
                    type="text"
                    value={config.variable || ''}
                    onChange={(e) => updateConfig('variable', e.target.value)}
                    placeholder="{{response}}"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Operator
                </label>
                <select
                    value={config.operator || 'equals'}
                    onChange={(e) => updateConfig('operator', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                >
                    <option value="equals">Equals</option>
                    <option value="notEquals">Not Equals</option>
                    <option value="contains">Contains</option>
                    <option value="greaterThan">Greater Than</option>
                    <option value="lessThan">Less Than</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Value
                </label>
                <input
                    type="text"
                    value={config.value || ''}
                    onChange={(e) => updateConfig('value', e.target.value)}
                    placeholder="yes"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
            </div>
        </div>
    );
}

function ButtonConfig({ config, updateConfig }) {
    const buttons = config.buttons || [
        { text: '', type: 'reply', url: '' },
        { text: '', type: 'reply', url: '' },
        { text: '', type: 'reply', url: '' }
    ];

    const updateButton = (index, field, value) => {
        const newButtons = [...buttons];
        newButtons[index] = { ...newButtons[index], [field]: value };
        updateConfig('buttons', newButtons);
    };

    const addButton = () => {
        if (buttons.length < 3) {
            updateConfig('buttons', [...buttons, { text: '', type: 'reply', url: '' }]);
        }
    };

    const removeButton = (index) => {
        updateConfig('buttons', buttons.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Header Message</label>
                <textarea
                    value={config.headerText || ''}
                    onChange={(e) => updateConfig('headerText', e.target.value)}
                    placeholder="Message shown above buttons..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    rows={3}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Footer Text (Optional)</label>
                <input
                    type="text"
                    value={config.footerText || ''}
                    onChange={(e) => updateConfig('footerText', e.target.value)}
                    placeholder="Footer message..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
            </div>

            <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700">Buttons (max 3)</label>
                {buttons.map((button, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg border space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-gray-600">Button {index + 1}</label>
                            {buttons.length > 1 && (
                                <button onClick={() => removeButton(index)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                            )}
                        </div>

                        <input
                            type="text"
                            value={button.text}
                            onChange={(e) => updateButton(index, 'text', e.target.value)}
                            placeholder="Button label (max 20 chars)"
                            maxLength={20}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />

                        <select
                            value={button.type || 'reply'}
                            onChange={(e) => updateButton(index, 'type', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        >
                            <option value="reply">Quick Reply (next node se link hoga)</option>
                            <option value="url">URL Open karo</option>
                            <option value="phone">Phone Call</option>
                        </select>

                        {button.type === 'url' && (
                            <input
                                type="url"
                                value={button.url || ''}
                                onChange={(e) => updateButton(index, 'url', e.target.value)}
                                placeholder="https://..."
                                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                            />
                        )}
                        {button.type === 'phone' && (
                            <input
                                type="text"
                                value={button.phone || ''}
                                onChange={(e) => updateButton(index, 'phone', e.target.value)}
                                placeholder="+91XXXXXXXXXX"
                                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg"
                            />
                        )}
                        {button.type === 'reply' && (
                            <p className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                Flow editor mein is button se next node connect karo
                            </p>
                        )}
                    </div>
                ))}

                {buttons.length < 3 && (
                    <button
                        onClick={addButton}
                        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-green-400 hover:text-green-600"
                    >
                        + Add Button
                    </button>
                )}
            </div>
        </div>
    );
}

function TemplateConfig({ config, updateConfig }) {
    const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const [templates, setTemplates] = useState([]);

    useEffect(() => {
        fetch(`${API_URL}/api/whatsapp/templates`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('sb-access-token')}` } // Fallback auth, you may want to adjust this
        })
        .then(r => r.json())
        .then(data => setTemplates(Array.isArray(data) ? data : []))
        .catch(() => setTemplates([]));
    }, []);

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Template Select karo</label>
                <select
                    value={config.templateName || ''}
                    onChange={(e) => {
                        const selected = templates.find(t => t.name === e.target.value);
                        updateConfig('templateName', e.target.value);
                        updateConfig('language', selected?.language || 'en_US');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                    <option value="">-- Template choose karo --</option>
                    {templates.map(t => (
                        <option key={t.name} value={t.name}>{t.name} ({t.status})</option>
                    ))}
                </select>
            </div>

            {config.templateName && (
                <div className="p-3 bg-indigo-50 rounded-lg">
                    <p className="text-xs text-indigo-600 font-medium">Selected: {config.templateName}</p>
                    <p className="text-xs text-gray-500">Language: {config.language}</p>
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Template Variables (optional)</label>
                <textarea
                    value={config.variables || ''}
                    onChange={(e) => updateConfig('variables', e.target.value)}
                    placeholder={'{"1": "John", "2": "Order #123"}'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                    rows={3}
                />
                <p className="text-xs text-gray-400 mt-1">JSON format mein variable values do</p>
            </div>
        </div>
    );
}

function InteractiveListConfig({ config, updateConfig }) {
    const items = config.items || [{ id: 'item1', title: '', description: '' }];

    const updateItem = (index, field, value) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        updateConfig('items', newItems);
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Header Text</label>
                <input type="text" value={config.headerText || ''} onChange={(e) => updateConfig('headerText', e.target.value)} placeholder="Choose an option:" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Button Label</label>
                <input type="text" value={config.buttonLabel || ''} onChange={(e) => updateConfig('buttonLabel', e.target.value)} placeholder="View Options" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">List Items</label>
                {items.map((item, idx) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg space-y-2 mb-2">
                        <input type="text" value={item.id} onChange={(e) => updateItem(idx, 'id', e.target.value)} placeholder="ID (e.g. opt1)" className="w-full px-2 py-1 border rounded text-xs font-mono" />
                        <input type="text" value={item.title} onChange={(e) => updateItem(idx, 'title', e.target.value)} placeholder="Title" className="w-full px-2 py-1 border rounded text-sm" />
                        <input type="text" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} placeholder="Description (optional)" className="w-full px-2 py-1 border rounded text-sm" />
                    </div>
                ))}
                <button onClick={() => updateConfig('items', [...items, { id: `item${items.length + 1}`, title: '', description: '' }])} className="w-full py-1.5 border-dashed border-2 border-gray-300 rounded text-sm text-gray-400 hover:text-teal-600">
                    + Add Item
                </button>
            </div>
        </div>
    );
}

function LocationConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Latitude
                </label>
                <input
                    type="text"
                    value={config.latitude || ''}
                    onChange={(e) => updateConfig('latitude', e.target.value)}
                    placeholder="37.7749"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Longitude
                </label>
                <input
                    type="text"
                    value={config.longitude || ''}
                    onChange={(e) => updateConfig('longitude', e.target.value)}
                    placeholder="-122.4194"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address Name
                </label>
                <input
                    type="text"
                    value={config.address || ''}
                    onChange={(e) => updateConfig('address', e.target.value)}
                    placeholder="San Francisco, CA"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>
    );
}

function HTTPAPIConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    HTTP Method
                </label>
                <select
                    value={config.method || 'GET'}
                    onChange={(e) => updateConfig('method', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL
                </label>
                <input
                    type="url"
                    value={config.url || ''}
                    onChange={(e) => updateConfig('url', e.target.value)}
                    placeholder="https://api.example.com/endpoint"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            {(config.method === 'POST' || config.method === 'PUT') && (
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Request Body (JSON)
                    </label>
                    <textarea
                        value={config.body || ''}
                        onChange={(e) => updateConfig('body', e.target.value)}
                        placeholder='{"key": "value"}'
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                        rows={4}
                    />
                </div>
            )}
        </div>
    );
}

function DefaultConfig({ config, updateConfig }) {
    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Label
                </label>
                <input
                    type="text"
                    value={config.label || ''}
                    onChange={(e) => updateConfig('label', e.target.value)}
                    placeholder="Enter label..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>
    );
}

function SmartDelayConfig({ config, updateConfig }) {
    const delay = config.delay || { seconds: 0, minutes: 0, hours: 0 };

    const updateDelay = (field, value) => {
        updateConfig('delay', { ...delay, [field]: parseInt(value) || 0 });
    };

    return (
        <div className="space-y-3 p-4 bg-blue-50 rounded-lg">
            <label className="block text-sm font-medium text-gray-700">
                Smart Delay in Reply
            </label>

            <div>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Seconds</span>
                    <span>{delay.seconds}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="60"
                    value={delay.seconds}
                    onChange={(e) => updateDelay('seconds', e.target.value)}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
            </div>

            <div>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Minutes</span>
                    <span>{delay.minutes}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="60"
                    value={delay.minutes}
                    onChange={(e) => updateDelay('minutes', e.target.value)}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
            </div>

            <div>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Hours</span>
                    <span>{delay.hours}</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="24"
                    value={delay.hours}
                    onChange={(e) => updateDelay('hours', e.target.value)}
                    className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
            </div>
        </div>
    );
}
