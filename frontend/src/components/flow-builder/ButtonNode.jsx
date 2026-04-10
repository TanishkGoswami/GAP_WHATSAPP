import { Handle, Position } from 'reactflow'
import { Component } from 'lucide-react'

export default function ButtonNode({ data }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-64">
            <div className="bg-orange-50 p-3 rounded-t-lg border-b border-orange-100 flex items-center gap-2">
                <Component className="h-4 w-4 text-orange-600" />
                <div className="text-xs font-bold text-orange-800 uppercase tracking-wide">Interactive Buttons</div>
            </div>

            <div className="p-3 space-y-2">
                <div className="text-sm text-gray-600 mb-3">
                    {data.label || 'Select an option below:'}
                </div>

                <div className="space-y-2">
                    <div className="bg-gray-100 px-3 py-2 rounded text-center text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer border border-gray-200">
                        Yes, I'm interested
                        <Handle type="source" position={Position.Right} id="btn-1" className="w-2 h-2 bg-orange-500" style={{ right: -8 }} />
                    </div>
                    <div className="bg-gray-100 px-3 py-2 rounded text-center text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer border border-gray-200">
                        No, thanks
                        <Handle type="source" position={Position.Right} id="btn-2" className="w-2 h-2 bg-orange-500" style={{ right: -8 }} />
                    </div>
                    <div className="bg-gray-100 px-3 py-2 rounded text-center text-sm font-medium text-gray-700 hover:bg-gray-200 cursor-pointer border border-gray-200">
                        More Info
                        <Handle type="source" position={Position.Right} id="btn-3" className="w-2 h-2 bg-orange-500" style={{ right: -8 }} />
                    </div>
                </div>
            </div>

            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />
        </div>
    )
}
