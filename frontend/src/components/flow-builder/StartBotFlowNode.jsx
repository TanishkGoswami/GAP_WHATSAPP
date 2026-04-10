import BaseNode from './BaseNode';
import { Rocket } from 'lucide-react';

export default function StartBotFlowNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={Rocket}
            title="Start Bot Flow"
            color="blue"
            selected={selected}
            handles={{ input: false, output: true }}
        >
            <div className="space-y-2">
                {config.keywords ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Keywords:</span>
                        <div className="font-medium text-gray-800 mt-1">{config.keywords}</div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Configure trigger keywords
                    </div>
                )}

                {config.matchType && (
                    <div className="text-[10px] text-gray-500">
                        Match: <span className="font-medium">{config.matchType}</span>
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
