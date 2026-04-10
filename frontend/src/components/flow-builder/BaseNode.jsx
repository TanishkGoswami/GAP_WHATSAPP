import { Handle, Position } from 'reactflow';
import { Trash2, Check, AlertCircle } from 'lucide-react';

export default function BaseNode({
    id,
    data,
    icon: Icon,
    title,
    color = 'blue',
    children,
    handles = { input: true, output: true },
    selected = false
}) {
    const colorClasses = {
        blue: 'bg-blue-500 border-blue-400 text-blue-700',
        green: 'bg-green-500 border-green-400 text-green-700',
        purple: 'bg-purple-500 border-purple-400 text-purple-700',
        orange: 'bg-orange-500 border-orange-400 text-orange-700',
        pink: 'bg-pink-500 border-pink-400 text-pink-700',
        red: 'bg-red-500 border-red-400 text-red-700',
        teal: 'bg-teal-500 border-teal-400 text-teal-700',
        indigo: 'bg-indigo-500 border-indigo-400 text-indigo-700',
        yellow: 'bg-yellow-500 border-yellow-400 text-yellow-700',
    };

    const bgColor = colorClasses[color]?.split(' ')[0] || 'bg-blue-500';
    const borderColor = colorClasses[color]?.split(' ')[1] || 'border-blue-400';

    const status = data?.status || { sent: 0, delivered: 0, subscribers: 0, errors: 0 };

    return (
        <div
            className={`bg-white rounded-lg shadow-md transition-all ${selected ? 'ring-2 ring-blue-400 shadow-lg scale-105' : 'hover:shadow-lg'
                }`}
            style={{ minWidth: '240px', maxWidth: '280px' }}
        >
            {handles.input && (
                <Handle
                    type="target"
                    position={Position.Top}
                    className="w-3 h-3 bg-gray-400 border-2 border-white"
                />
            )}

            {/* Header */}
            <div className={`${bgColor} text-white px-3 py-2 rounded-t-lg flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                    {Icon && <Icon className="h-4 w-4" />}
                    <span className="text-sm font-semibold">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                    {data?.configured && (
                        <Check className="h-3 w-3 text-white opacity-70" />
                    )}
                    <button
                        onClick={() => data?.onDelete?.(id)}
                        className="text-white hover:text-red-200 transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="p-3">
                {children}
            </div>

            {/* Status Footer */}
            {(status.sent > 0 || status.delivered > 0 || status.subscribers > 0 || status.errors > 0) && (
                <div className="border-t border-gray-200 px-3 py-2 bg-gray-50 rounded-b-lg">
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <div className="flex flex-col items-center">
                            <span className="text-blue-600 font-semibold">{status.sent}</span>
                            <span className="text-gray-500">Sent</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-green-600 font-semibold">{status.delivered}</span>
                            <span className="text-gray-500">Delivered</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-purple-600 font-semibold">{status.subscribers}</span>
                            <span className="text-gray-500">Subscribers</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className={`font-semibold ${status.errors > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                {status.errors}
                            </span>
                            <span className="text-gray-500">Errors</span>
                        </div>
                    </div>
                </div>
            )}

            {handles.output && (
                <Handle
                    type="source"
                    position={Position.Bottom}
                    className="w-3 h-3 bg-gray-400 border-2 border-white"
                />
            )}
        </div>
    );
}
