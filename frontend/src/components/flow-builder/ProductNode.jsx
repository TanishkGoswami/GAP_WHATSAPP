import BaseNode from './BaseNode';
import { PackageSearch } from 'lucide-react';

export default function ProductNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={PackageSearch}
            title="Product"
            color="yellow"
            selected={selected}
        >
            <div className="space-y-2">
                {config.productName ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Product:</span>
                        <div className="font-medium text-yellow-800 mt-1">
                            {config.productName}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Select product
                    </div>
                )}

                {config.price && (
                    <div className="text-[11px] font-semibold text-green-600">
                        ${config.price}
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
