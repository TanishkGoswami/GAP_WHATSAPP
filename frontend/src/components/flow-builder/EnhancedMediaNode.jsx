import BaseNode from './BaseNode';
import { Image, Video, Music, FileText } from 'lucide-react';

export default function EnhancedMediaNode({ id, data, selected }) {
    const config = data?.config || {};
    const mediaType = data?.mediaType || 'image';

    const icons = {
        image: Image,
        video: Video,
        audio: Music,
        file: FileText
    };

    const colors = {
        image: 'purple',
        video: 'pink',
        audio: 'green',
        file: 'indigo'
    };

    const Icon = icons[mediaType];

    return (
        <BaseNode
            id={id}
            data={data}
            icon={Icon}
            title={mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}
            color={colors[mediaType]}
            selected={selected}
        >
            <div className="space-y-2">
                {config.uploadMethod === 'custom' ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Custom Field:</span>
                        <div className="font-mono text-[11px] bg-purple-50 px-2 py-1 rounded mt-1">
                            {config.customField || 'Not configured'}
                        </div>
                    </div>
                ) : config.url ? (
                    <div className="text-xs">
                        <span className="text-gray-500">URL:</span>
                        <div className="font-mono text-[10px] bg-gray-50 px-2 py-1 rounded mt-1 truncate">
                            {config.url}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Click to configure {mediaType}
                    </div>
                )}

                {config.caption && (
                    <div className="text-xs text-gray-700 line-clamp-2">
                        "{config.caption}"
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
