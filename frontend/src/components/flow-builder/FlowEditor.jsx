import { useState, useRef, useCallback } from 'react';
import ReactFlow, {
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    MarkerType,
    Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Save, ArrowLeft, Play, Zap } from 'lucide-react';
import axios from 'axios';

// Import all node components
import StartBotFlowNode from './StartBotFlowNode';
import EnhancedTextNode from './EnhancedTextNode';
import EnhancedMediaNode from './EnhancedMediaNode';
import UserInputNode from './UserInputNode';
import EnhancedConditionNode from './EnhancedConditionNode';
import EnhancedButtonNode from './EnhancedButtonNode';
import LocationNode from './LocationNode';
import HTTPAPINode from './HTTPAPINode';
import AINode from './AINode';
import InteractiveNode from './InteractiveNode';
import WhatsAppFlowNode from './WhatsAppFlowNode';
import GoogleSheetsNode from './GoogleSheetsNode';
import TemplateMessageNode from './TemplateMessageNode';
import AppointmentNode from './AppointmentNode';
import ProductNode from './ProductNode';

// Import UI components
import EnhancedFlowSidebar from './EnhancedFlowSidebar';
import NodeConfigPanel from './NodeConfigPanel';

// Register all node types
const nodeTypes = {
    startBotFlow: StartBotFlowNode,
    textMessage: EnhancedTextNode,
    image: (props) => <EnhancedMediaNode {...props} data={{ ...props.data, mediaType: 'image' }} />,
    video: (props) => <EnhancedMediaNode {...props} data={{ ...props.data, mediaType: 'video' }} />,
    audio: (props) => <EnhancedMediaNode {...props} data={{ ...props.data, mediaType: 'audio' }} />,
    file: (props) => <EnhancedMediaNode {...props} data={{ ...props.data, mediaType: 'file' }} />,
    userInput: UserInputNode,
    condition: EnhancedConditionNode,
    button: EnhancedButtonNode,
    location: LocationNode,
    httpApi: HTTPAPINode,
    ai: AINode,
    interactive: InteractiveNode,
    whatsappFlow: WhatsAppFlowNode,
    googleSheets: GoogleSheetsNode,
    template: TemplateMessageNode,
    appointment: AppointmentNode,
    product: ProductNode,
};

function FlowEditorContent({ flow, onClose }) {
    const reactFlowWrapper = useRef(null);
    const [nodes, setNodes, onNodesChange] = useNodesState(flow?.nodes || []);
    const [edges, setEdges, onEdgesChange] = useEdgesState(flow?.edges || []);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);
    const [configPanelOpen, setConfigPanelOpen] = useState(false);

    const getId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const onConnect = useCallback(
        (params) => setEdges((eds) => addEdge({
            ...params,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
        }, eds)),
        []
    );

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');
            if (!type || !reactFlowInstance) return;

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode = {
                id: getId(),
                type,
                position,
                data: {
                    label: `New ${type}`,
                    config: {},
                    configured: false,
                    status: { sent: 0, delivered: 0, subscribers: 0, errors: 0 },
                    onDelete: handleDeleteNode,
                    onUpdate: handleUpdateNode,
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance]
    );

    const handleDeleteNode = (nodeId) => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
        if (selectedNode?.id === nodeId) {
            setSelectedNode(null);
            setConfigPanelOpen(false);
        }
    };

    const handleUpdateNode = (nodeId, newData) => {
        setNodes((nds) =>
            nds.map((node) => (node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node))
        );
    };

    const onDragStart = (event, nodeType, nodeInfo) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    const onNodeClick = useCallback((event, node) => {
        setSelectedNode(node);
        setConfigPanelOpen(true);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
    }, []);

    const handleSaveConfig = (nodeId, config) => {
        setNodes((nds) =>
            nds.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, config, configured: true } }
                    : node
            )
        );
    };

    const handleSave = async () => {
        try {
            const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
            await axios.put(`${API_URL}/api/flows/${flow.id}`, { nodes, edges });
            // alert('Flow saved successfully! ✅');
            onClose(); // Redirect out of editor
        } catch (error) {
            console.error('Error saving flow:', error);
            alert('Failed to save flow ❌');
        }
    };

    const handleTest = () => {
        console.log('Testing flow:', { nodes, edges });
        alert('Flow test started! Check console for details.');
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900">{flow.name}</h1>
                        <p className="text-xs text-gray-500">{flow.description}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 px-3 py-1.5 bg-gray-100 rounded-lg">
                        <span className="font-semibold">{nodes.length}</span> nodes · <span className="font-semibold">{edges.length}</span> connections
                    </div>
                    <button
                        onClick={handleTest}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
                    >
                        <Play className="h-4 w-4" />
                        Test Flow
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 text-sm font-medium shadow-sm transition-all"
                    >
                        <Save className="h-4 w-4" />
                        Save Flow
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <EnhancedFlowSidebar onDragStart={onDragStart} />

                {/* Canvas */}
                <div className="flex-1 relative" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes.map(node => ({
                            ...node,
                            selected: selectedNode?.id === node.id
                        }))}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onInit={setReactFlowInstance}
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        nodeTypes={nodeTypes}
                        fitView
                        className="bg-gray-50"
                        defaultEdgeOptions={{
                            type: 'smoothstep',
                            animated: true,
                            style: { strokeWidth: 2, stroke: '#94a3b8' },
                        }}
                        minZoom={0.2}
                        maxZoom={2}
                    >
                        <Controls className="bg-white border border-gray-200 rounded-lg shadow-sm" />
                        <Background
                            color="#d1d5db"
                            gap={20}
                            size={1}
                            variant="dots"
                        />

                        {/* Empty State */}
                        {nodes.length === 0 && (
                            <Panel position="top-center" className="mt-20">
                                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 max-w-md text-center">
                                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Zap className="h-8 w-8 text-white" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">
                                        Start Building Your Flow
                                    </h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Drag nodes from the sidebar to create your WhatsApp automation workflow
                                    </p>
                                    <div className="flex gap-2 justify-center text-xs text-gray-500">
                                        <span className="bg-blue-50 px-3 py-1.5 rounded-full">📱 Messages</span>
                                        <span className="bg-purple-50 px-3 py-1.5 rounded-full">🤖 AI</span>
                                        <span className="bg-green-50 px-3 py-1.5 rounded-full">🔗 Integrations</span>
                                    </div>
                                </div>
                            </Panel>
                        )}
                    </ReactFlow>
                </div>

                {/* Configuration Panel */}
                {configPanelOpen && selectedNode && (
                    <NodeConfigPanel
                        node={selectedNode}
                        onClose={() => setConfigPanelOpen(false)}
                        onSave={handleSaveConfig}
                    />
                )}
            </div>
        </div>
    );
}

export default function FlowEditor({ flow, onClose }) {
    return (
        <ReactFlowProvider>
            <FlowEditorContent flow={flow} onClose={onClose} />
        </ReactFlowProvider>
    );
}
