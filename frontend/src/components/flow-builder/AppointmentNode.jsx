import BaseNode from './BaseNode';
import { Calendar } from 'lucide-react';

export default function AppointmentNode({ id, data, selected }) {
    const config = data?.config || {};

    return (
        <BaseNode
            id={id}
            data={data}
            icon={Calendar}
            title="Appointment"
            color="blue"
            selected={selected}
        >
            <div className="space-y-2">
                {config.type ? (
                    <div className="text-xs">
                        <span className="text-gray-500">Type:</span>
                        <div className="font-medium text-blue-800 mt-1">
                            {config.type}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-gray-400 italic">
                        Configure appointment
                    </div>
                )}
            </div>
        </BaseNode>
    );
}
