import BaseNode from './BaseNode';
import { FileText } from 'lucide-react';

export default function TemplateMessageNode({ id, data, selected }) {
    const config = data?.config || {};

    const templateLabel = config.templateName || config.template || 'Select template';
    const templateSource = config.templateSource || 'whatsapp';

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
                <div className="text-xs">
                    <span className="text-gray-500">Source:</span>
                    <div className="font-medium text-indigo-800 mt-1">
                        {templateSource === 'flow' ? 'Flow Template' : 'WhatsApp Template'}
                    </div>
                </div>

                {templateLabel && (
                    <div className="text-xs">
                        <span className="text-gray-500">Template:</span>
                        <div className="font-medium text-indigo-800 mt-1">
                            {templateLabel}
                        </div>
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
