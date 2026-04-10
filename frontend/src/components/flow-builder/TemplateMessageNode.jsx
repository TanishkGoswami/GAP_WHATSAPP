import BaseNode from './BaseNode';
import { FileText } from 'lucide-react';

export default function TemplateMessageNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={FileText}
            title="Template Message"
            color="indigo"
            selected={selected}
        >
            <div className="space-y-2">
                {config.template ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Template:</span>
                        <div className="font-medium text-indigo-800 mt-1">
                            {config.template}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Select template
                    </div>
                )}

                {config.language && (
                    <div className="text-[10px] text-gray-500">
                        🌐 {config.language}
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
