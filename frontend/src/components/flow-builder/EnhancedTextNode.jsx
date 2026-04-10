import BaseNode from './BaseNode';
import { MessageSquare } from 'lucide-react';

export default function EnhancedTextNode({ id, data, selected }) {
    const config = data?.config || {};
    const message = config.message || 'Click to configure message...';

    return (
        <BaseNode
            id={id}
            data={data}
            icon={MessageSquare}
            title="Text Message"
            color="blue"
            selected={selected}
        >
            <div className="space-y-2">
                <div className="text-xs text-gray-700 line-clamp-3 bg-gray-50 p-2 rounded">
                    {message}
                </div>

                {config.delay && (config.delay.seconds > 0 || config.delay.minutes > 0 || config.delay.hours > 0) && (
                    <div className="text-[10px] text-blue-600 flex items-center gap-1">
                        <span>⏱️</span>
                        <span>
                            Delay: {config.delay.hours}h {config.delay.minutes}m {config.delay.seconds}s
                        </span>
                    </div>
                )}

                {config.typingDisplay && (
                    <div className="text-[10px] text-gray-500">
                        ⌨️ Typing indicator enabled
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
