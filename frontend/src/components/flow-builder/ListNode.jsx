import { Handle, Position } from 'reactflow'
import { List } from 'lucide-react'

export default function ListNode({ data }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-64">
            <div className="bg-teal-50 p-3 rounded-t-lg border-b border-teal-100 flex items-center gap-2">
                <List className="h-4 w-4 text-teal-600" />
                <div className="text-xs font-bold text-teal-800 uppercase tracking-wide">List Menu</div>
            </div>

            <div className="p-3">
                <div className="text-sm font-medium text-gray-900 mb-1">
                    {data.title || 'Main Menu'}
                </div>
                <div className="text-xs text-gray-500 mb-3">
                    {data.description || 'Please select an option from the list'}
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded p-2 text-center text-sm text-teal-700 font-medium">
                    View Menu Items (Click to Open)
                </div>
            </div>

            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />
            <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
        </div>
    )
}
