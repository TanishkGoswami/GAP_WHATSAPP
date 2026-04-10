import { Handle, Position } from 'reactflow'
import { MessageSquare } from 'lucide-react'

export default function TextNode({ data }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-64">
            <div className="bg-green-50 p-3 rounded-t-lg border-b border-green-100 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-green-600" />
                <div className="text-xs font-bold text-green-800 uppercase tracking-wide">Text Message</div>
            </div>

            <div className="p-3">
                <div className="text-sm text-gray-600">
                    {data.label || 'Enter your message...'}
                </div>
            </div>

            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />
            <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
        </div>
    )
}
