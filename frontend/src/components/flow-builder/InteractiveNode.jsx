import BaseNode from './BaseNode';
import { List } from 'lucide-react';

export default function InteractiveNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={List}
            title="Interactive List"
            color="teal"
            selected={selected}
        >
            <div className="space-y-2">
                {config.type ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Type:</span>
                        <div className="font-medium text-teal-800 mt-1">
                            {config.type === 'buttons' ? '🔘 Buttons' : '📋 List'}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Configure interactive element
                    </div>
                )}

                {config.buttonCount && (
                    <div className="text-[10px] text-gray-500">
                        {config.buttonCount} button(s)
                    </div>
                )}
            </div>
        </BaseNode >
    );
}
