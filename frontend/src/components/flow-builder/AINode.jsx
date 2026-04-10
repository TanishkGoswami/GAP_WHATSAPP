import { Handle, Position } from 'reactflow'
import { Bot, Sparkles } from 'lucide-react'

export default function AINode({ data }) {
    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm w-64">
            <div className="bg-pink-50 p-3 rounded-t-lg border-b border-pink-100 flex items-center gap-2">
                <Bot className="h-4 w-4 text-pink-600" />
                <div className="text-xs font-bold text-pink-800 uppercase tracking-wide">AI Agent</div>
            </div>

            <div className="p-3">
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 border border-pink-100 rounded-lg p-3 text-center">
                    <Sparkles className="h-5 w-5 text-pink-500 mx-auto mb-1" />
                    <div className="text-xs font-medium text-pink-700">Powered by Gemini AI</div>
                </div>

                <div className="mt-2 text-xs text-gray-500">
                    Redirects user input to AI for automated smart replies using the knowledge base.
                </div>
            </div>

            <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />
            <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
        </div>
    )
}
