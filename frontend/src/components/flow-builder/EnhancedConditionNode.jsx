import BaseNode from './BaseNode';
import { Handle, Position } from 'reactflow';
import { GitBranch } from 'lucide-react';

export default function EnhancedConditionNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <div className="relative">
            <BaseNode
                id={id}
                data={data}
                icon={GitBranch}
                title="Condition"
                color="orange"
                selected={selected}
                handles={{ input: true, output: false }}
            >
                <div className="space-y-2">
                    {config.variable && config.operator && config.value ? (
                        <>
                            <div className="text-xs font-mono bg-orange-50 px-2 py-1.5 rounded">
                                {config.variable}
                            </div>
                            <div className="text-center text-[10px] text-gray-500 font-medium">
                                {config.operator}
                            </div>
                            <div className="text-xs font-mono bg-orange-50 px-2 py-1.5 rounded">
                                {config.value}
                            </div>
                        </>
                    ) : (
                        <div className="text-xs text-gray-400 italic">
                            Configure condition logic
                        </div>
                    )}
                </div>
            </BaseNode>

            {/* Custom handles for true/false paths */}
            <Handle
                type="source"
                position={Position.Bottom}
                id="true"
                className="w-3 h-3 bg-green-500 border-2 border-white"
                style={{ left: '30%' }}
            />
            <div
                className="absolute bottom-1 text-[9px] font-medium text-green-600"
                style={{ left: '30%', transform: 'translateX(-50%)' }}
            >
                True
            </div>

            <Handle
                type="source"
                position={Position.Bottom}
                id="false"
                className="w-3 h-3 bg-red-500 border-2 border-white"
                style={{ left: '70%' }}
            />
            <div
                className="absolute bottom-1 text-[9px] font-medium text-red-600"
                style={{ left: '70%', transform: 'translateX(-50%)' }}
            >
                False
            </div>
        </div>
    );
}
