import BaseNode from './BaseNode';
import { MapPin } from 'lucide-react';

export default function LocationNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={MapPin}
            title="Location"
            color="red"
            selected={selected}
        >
            <div className="space-y-2">
                {config.latitude && config.longitude ? (
                    <>
                        <div className="text-xs font-mono bg-red-50 px-2 py-1 rounded">
                            📍 {config.latitude}, {config.longitude}
                        </div>
                        {config.address && (
                            <div className="text-xs text-gray-700">
                                {config.address}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Configure location
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
