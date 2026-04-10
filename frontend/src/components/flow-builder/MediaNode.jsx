import { Handle, Position } from 'reactflow'
import { Image, Upload } from 'lucide-react'

export default function MediaNode({ data }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-64">
            <div className="bg-purple-50 p-3 rounded-t-lg border-b border-purple-100 flex items-center gap-2">
                <Image className="h-4 w-4 text-purple-600" />
                <div className="text-xs font-bold text-purple-800 uppercase tracking-wide">Image / Video</div>
            </div>

            <div className="p-3">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                    <Upload className="h-8 w-8 mb-2" />
                    <span className="text-xs">Upload Media</span>
                </div>
                {data.caption && (
                    <div className="mt-2 text-sm text-gray-600 truncate">{data.caption}</div>
                )}
            </div>

            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />
            <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
        </div>
    )
}
