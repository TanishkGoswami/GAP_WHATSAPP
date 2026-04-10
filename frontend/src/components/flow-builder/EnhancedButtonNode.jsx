import BaseNode from './BaseNode';
import { Link2 } from 'lucide-react';

export default function EnhancedButtonNode({ id, data, selected }) {
    const config = data?.config || {};
    const buttons = config.buttons || [];

    return (
        <BaseNode
            id={id}
            data={data}
            icon={Link2}
            title="Buttons"
            color="green"
            selected={selected}
        >
            <div className="space-y-1.5">
                {buttons.length > 0 ? (
                    buttons.map((btn, idx) => (
                        btn.text && (
                            <div key={idx} className="bg-green-50 border border-green-200 rounded px-2 py-1.5">
                                <div className="text-xs font-medium text-green-800">{btn.text}</div>
                                {btn.url && (
                                    <div className="text-[10px] text-green-600 truncate font-mono">
                                        {btn.url}
                                    </div>
                                )}
                            </div>
                        )
                    ))
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Configure buttons
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
