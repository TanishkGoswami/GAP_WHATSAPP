import BaseNode from './BaseNode';
import { UserCircle } from 'lucide-react';

export default function UserInputNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={UserCircle}
            title="User Input"
            color="purple"
            selected={selected}
        >
            <div className="space-y-2">
                <div className="text-xs">
                    <span className="text-gray-500">Input Type:</span>
                    <div className="font-medium text-gray-800 mt-1">
                        {config.inputType || 'text'}
                    </div>
                </div>

                {config.saveToField && (
                    <div className="text-xs">
                        <span className="text-gray-500">Save to:</span>
                        <div className="font-mono text-[11px] bg-purple-50 px-2 py-1 rounded mt-1">
                            {`{{${config.saveToField}}}`}
                        </div>
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
