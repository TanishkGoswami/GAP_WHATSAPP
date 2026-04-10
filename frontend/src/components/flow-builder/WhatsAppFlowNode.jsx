import BaseNode from './BaseNode';
import { Workflow } from 'lucide-react';

export default function WhatsAppFlowNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={Workflow}
            title="WhatsApp Flow"
            color="green"
            selected={selected}
        >
            <div className="space-y-2">
                {config.flowName ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Flow:</span>
                        <div className="font-medium text-green-800 mt-1">
                            {config.flowName}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Configure WhatsApp Flow
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
