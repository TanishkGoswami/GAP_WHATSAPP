import { MessageSquare, Image, Component, List, Bot, Keyboard, GitBranch } from 'lucide-react'

export default function FlowSidebar() {
    const onDragStart = (event, nodeType) => {
        event.dataTransfer.setData('application/reactflow', nodeType)
        event.dataTransfer.effectAllowed = 'move'
    }

    return (
        <div className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col gap-4 h-full">
            <div className="font-bold text-gray-700 mb-2">Components</div>

            <div
                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-grab hover:bg-gray-100 transition-colors"
                onDragStart={(event) => onDragStart(event, 'textNode')}
                draggable
            >
                <MessageSquare className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Text Message</span>
            </div>

            <div
                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-grab hover:bg-gray-100 transition-colors"
                onDragStart={(event) => onDragStart(event, 'mediaNode')}
                draggable
            >
                <Image className="h-5 w-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">Image / Video</span>
            </div>

            <div
                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-grab hover:bg-gray-100 transition-colors"
                onDragStart={(event) => onDragStart(event, 'buttonNode')}
                draggable
            >
                <Component className="h-5 w-5 text-orange-600" />
                <span className="text-sm font-medium text-gray-700">Buttons</span>
            </div>

            <div
                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-grab hover:bg-gray-100 transition-colors"
                onDragStart={(event) => onDragStart(event, 'listNode')}
                draggable
            >
                <List className="h-5 w-5 text-teal-600" />
                <span className="text-sm font-medium text-gray-700">List Menu</span>
            </div>

            <div
                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-grab hover:bg-gray-100 transition-colors"
                onDragStart={(event) => onDragStart(event, 'aiNode')}
                draggable
            >
                <Bot className="h-5 w-5 text-pink-600" />
                <span className="text-sm font-medium text-gray-700">AI Support Agent</span>
            </div>

            <div
                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-grab hover:bg-gray-100 transition-colors"
                onDragStart={(event) => onDragStart(event, 'inputNode')}
                draggable
            >
                <Keyboard className="h-5 w-5 text-yellow-600" />
                <span className="text-sm font-medium text-gray-700">Collect Input</span>
            </div>

            <div
                className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-grab hover:bg-gray-100 transition-colors"
                onDragStart={(event) => onDragStart(event, 'logicNode')}
                draggable
            >
                <GitBranch className="h-5 w-5 text-orange-600" />
                <span className="text-sm font-medium text-gray-700">Logic / Condition</span>
            </div>

            <div className="mt-auto p-4 bg-blue-50 rounded-lg text-xs text-blue-800">
                Drag and drop nodes onto the canvas to build your bot flow.
            </div>
        </div>
    )
}
