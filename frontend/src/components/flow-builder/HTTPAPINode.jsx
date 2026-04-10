import BaseNode from './BaseNode';
import { Globe } from 'lucide-react';

export default function HTTPAPINode({ id, data, selected }) {
    const config = data?.config || {};

    const methodColors = {
        GET: 'text-green-600 bg-green-50',
        POST: 'text-blue-600 bg-blue-50',
        PUT: 'text-yellow-600 bg-yellow-50',
        DELETE: 'text-red-600 bg-red-50'
    };

    return (
        <BaseNode
            id={id}
            data={data}
            icon={Globe}
            title="HTTP API"
            color="indigo"
            selected={selected}
        >
            <div className="space-y-2">
                {config.method && (
                    <div className={`text-xs font-bold px-2 py-1 rounded inline-block ${methodColors[config.method]}`}>
                        {config.method}
                    </div>
                )}

                {config.url ? (
                    <div className="text-[10px] font-mono bg-gray-50 px-2 py-1 rounded break-all">
                        {config.url}
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Configure API endpoint
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
