import { Handle, Position } from 'reactflow'
import { GitBranch } from 'lucide-react'

export default function LogicNode({ data }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-64 ring-2 ring-orange-50">
            <div className="bg-orange-50 p-3 rounded-t-lg border-b border-orange-100 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-orange-600" />
                <div className="text-xs font-bold text-orange-800 uppercase tracking-wide">Condition</div>
            </div>

            <div className="p-3 bg-orange-50/10">
                <div className="text-sm text-gray-700 font-medium mb-2">
                    {data.label || 'Check Condition'}
                </div>
                <div className="text-xs text-gray-500">
                    If variable matches...
                </div>
            </div>

            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />

            <div className="absolute -right-3 top-12 flex flex-col gap-4">
                <div className="relative">
                    <Handle type="source" position={Position.Right} id="true" className="w-3 h-3 bg-green-500 !static translate-x-1.5" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-green-600 font-bold uppercase">True</span>
                </div>
                <div className="relative">
                    <Handle type="source" position={Position.Right} id="false" className="w-3 h-3 bg-red-500 !static translate-x-1.5" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-red-600 font-bold uppercase">False</span>
                </div>
            </div>
        </div>
    )
}
