import {
    Rocket, MessageSquare, Image, Video, Music, FileText, MapPin,
    UserCircle, Link2, GitBranch, Handshake, Square
} from 'lucide-react';
import { useState } from 'react';

const nodeCategories = [
    {
        title: 'Triggers',
        nodes: [
            { type: 'startBotFlow', icon: Rocket, label: 'Start Bot Flow', color: 'blue' }
        ]
    },
    {
        title: 'Messages',
        nodes: [
            { type: 'textMessage', icon: MessageSquare, label: 'Text Message', color: 'blue' },
            { type: 'image', icon: Image, label: 'Image', color: 'purple' },
            { type: 'video', icon: Video, label: 'Video', color: 'pink' },
            { type: 'audio', icon: Music, label: 'Audio', color: 'green' },
            { type: 'file', icon: FileText, label: 'File', color: 'indigo' },
        ]
    },
    {
        title: 'Interactive',
        nodes: [
            { type: 'button', icon: Link2, label: 'Buttons', color: 'green' },
            { type: 'location', icon: MapPin, label: 'Location', color: 'red' },
        ]
    },
    {
        title: 'Input & Logic',
        nodes: [
            { type: 'userInput', icon: UserCircle, label: 'User Input', color: 'purple' },
            { type: 'condition', icon: GitBranch, label: 'Condition', color: 'orange' },
        ]
    },
    {
        title: 'Flow Control',
        nodes: [
            { type: 'handoff', icon: Handshake, label: 'Handoff to Human', color: 'orange' },
            { type: 'end', icon: Square, label: 'End Flow', color: 'teal' },
        ]
    }
];

export default function EnhancedFlowSidebar({ onDragStart }) {
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsedCategories, setCollapsedCategories] = useState(new Set());

    const toggleCategory = (categoryTitle) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(categoryTitle)) {
                newSet.delete(categoryTitle);
            } else {
                newSet.add(categoryTitle);
            }
            return newSet;
        });
    };

    const filteredCategories = nodeCategories.map(category => ({
        ...category,
        nodes: category.nodes.filter(node =>
            node.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
    })).filter(category => category.nodes.length > 0);

    const colorClasses = {
        blue: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
        green: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
        purple: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
        orange: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
        pink: 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100',
        red: 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
        teal: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100',
        indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
        yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100',
    };

    return (
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col h-full">
            {/* Header */}
            <div className="p-4 border-b border-gray-200">
                <h3 className="text-sm font-bold text-gray-900 mb-3">Node Palette</h3>
                <input
                    type="text"
                    placeholder="Search nodes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            {/* Scrollable Categories */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {filteredCategories.map((category) => (
                    <div key={category.title}>
                        <button
                            onClick={() => toggleCategory(category.title)}
                            className="flex items-center justify-between w-full text-left mb-2"
                        >
                            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                {category.title}
                            </h4>
                            <span className="text-gray-400 text-xs">
                                {collapsedCategories.has(category.title) ? '▼' : '▲'}
                            </span>
                        </button>

                        {!collapsedCategories.has(category.title) && (
                            <div className="space-y-2">
                                {category.nodes.map((node) => {
                                    const Icon = node.icon;
                                    return (
                                        <div
                                            key={node.type}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, node.type, node)}
                                            className={`p-3 border rounded-lg cursor-move transition-all ${colorClasses[node.color]}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Icon className="h-4 w-4 flex-shrink-0" />
                                                <span className="text-xs font-medium">{node.label}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Help Section */}
            <div className="p-4 border-t border-gray-200 bg-gradient-to-br from-blue-50 to-purple-50">
                <div className="text-[10px] text-gray-700 leading-relaxed space-y-1">
                    <p className="font-semibold text-blue-900">💡 Quick Tips:</p>
                    <p>• Drag nodes to canvas</p>
                    <p>• Click node to configure</p>
                    <p>• Drag from dots to connect</p>
                    <p>• Right-click for menu</p>
                </div>
            </div>
        </div>
    );
}
