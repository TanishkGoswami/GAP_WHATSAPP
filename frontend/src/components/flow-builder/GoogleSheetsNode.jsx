import BaseNode from './BaseNode';
import { FileSpreadsheet } from 'lucide-react';

export default function GoogleSheetsNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={FileSpreadsheet}
            title="Google Sheets"
            color="green"
            selected={selected}
        >
            <div className="space-y-2">
                {config.action ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Action:</span>
                        <div className="font-medium text-green-800 mt-1">
                            {config.action}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Configure Google Sheets
                    </div>
                )}

                {config.spreadsheet && (
                    <div className="text-[10px] text-gray-600 truncate">
                        📊 {config.spreadsheet}
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
