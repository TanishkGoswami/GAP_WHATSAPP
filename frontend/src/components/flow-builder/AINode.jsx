import BaseNode from './BaseNode';
import { Bot, Sparkles } from 'lucide-react';

export default function AINode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode id={id} data={data} icon={Bot} title="AI Agent" color="green" selected={selected}>
            <div className="space-y-2">
                <div className="rounded border border-green-200 bg-green-50/80 p-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-green-800">
                        <Sparkles className="h-3.5 w-3.5" />
                        {config.label || 'Knowledge reply'}
                    </div>
                </div>
                <div className="text-xs text-gray-500">
                    {config.prompt || 'Smart replies from your business knowledge base.'}
                </div>
            </div>
        </BaseNode>
    );
}
