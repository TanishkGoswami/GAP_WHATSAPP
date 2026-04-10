import { Handle, Position } from 'reactflow'
import { Keyboard } from 'lucide-react'

export default function InputNode({ data }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-64 bg-yellow-50/30">
            <div className="bg-yellow-50 p-3 rounded-t-lg border-b border-yellow-100 flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-yellow-600" />
                <div className="text-xs font-bold text-yellow-800 uppercase tracking-wide">Collect Input</div>
            </div>

            <div className="p-3">
                <div className="text-sm text-gray-700 mb-1">
                    {data.question || 'Ask a question...'}
                </div>
                <div className="bg-white border border-gray-200 rounded px-2 py-1 text-xs text-gray-400 font-mono">
                    Save to variable: {data.variable || '{{input}}'}
                </div>
            </div>

            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />
            <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
        </div>
    )
}
