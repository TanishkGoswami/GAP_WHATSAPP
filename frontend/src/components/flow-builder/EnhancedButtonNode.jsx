import { Handle, Position } from 'reactflow';
import { Trash2, Check, Link2 } from 'lucide-react';

export default function EnhancedButtonNode({ id, data, selected }) {
    const config = data?.config || {};
    const buttons = config.buttons || [];

    return (
        <div
            className={`bg-white rounded-lg shadow-md transition-all ${selected ? 'ring-2 ring-green-400 shadow-lg' : 'hover:shadow-lg'}`}
            style={{ minWidth: '240px', maxWidth: '280px' }}
        >
            {/* Input Handle - Top */}
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-gray-400 border-2 border-white" />

            {/* Header */}
            <div className="bg-green-500 text-white px-3 py-2 rounded-t-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    <span className="text-sm font-semibold">Buttons</span>
                </div>
                <div className="flex items-center gap-1">
                    {data?.configured && <Check className="h-3 w-3 text-white opacity-70" />}
                    <button onClick={() => data?.onDelete?.(id)} className="text-white hover:text-red-200">
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="p-3 space-y-1.5">
                {config.headerText && (
                    <div className="text-xs text-gray-600 mb-2 bg-gray-50 p-2 rounded">{config.headerText}</div>
                )}

                {buttons.length > 0 ? (
                    buttons.map((btn, idx) => (
                        btn.text && (
                            <div key={idx} className="relative">
                                <div className="bg-green-50 border border-green-200 rounded px-2 py-1.5 pr-6">
                                    <div className="text-xs font-medium text-green-800">{btn.text}</div>
                                    <div className="text-[10px] text-green-500">
                                        {btn.type === 'url' ? '🔗 URL' : btn.type === 'phone' ? '📞 Call' : '↩ Reply'}
                                    </div>
                                </div>
                                {/* Per-button output handle */}
                                {btn.type === 'reply' && (
                                    <Handle
                                        type="source"
                                        position={Position.Right}
                                        id={`button-${idx}`}
                                        style={{ top: '50%', right: -8 }}
                                        className="w-3 h-3 bg-green-400 border-2 border-white"
                                    />
                                )}
                            </div>
                        )
                    ))
                ) : (
                    <div className="text-xs text-gray-400 italic">Configure buttons</div>
                )}
            </div>
        </div>
    );
}
