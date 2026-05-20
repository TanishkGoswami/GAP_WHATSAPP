import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';

const DialogContext = createContext(null);

const toneMap = {
    info: {
        icon: Info,
        iconClass: 'bg-blue-50 text-blue-600 ring-blue-100',
        primaryClass: 'bg-[#0070d1] text-white hover:bg-[#0064b7]',
    },
    success: {
        icon: CheckCircle2,
        iconClass: 'bg-green-50 text-green-600 ring-green-100',
        primaryClass: 'bg-green-600 text-white hover:bg-green-700',
    },
    warning: {
        icon: AlertCircle,
        iconClass: 'bg-amber-50 text-amber-600 ring-amber-100',
        primaryClass: 'bg-amber-500 text-white hover:bg-amber-600',
    },
    danger: {
        icon: Trash2,
        iconClass: 'bg-red-50 text-red-600 ring-red-100',
        primaryClass: 'bg-red-600 text-white hover:bg-red-700',
    },
};

export function DialogProvider({ children }) {
    const [dialog, setDialog] = useState(null);

    const openDialog = useCallback((kind, message, options = {}) => new Promise((resolve) => {
        setDialog({
            kind,
            message,
            title: options.title || (kind === 'confirm' ? 'Confirm action' : 'Notice'),
            tone: options.tone || (kind === 'confirm' ? 'warning' : 'info'),
            confirmLabel: options.confirmLabel || (kind === 'confirm' ? 'Confirm' : 'OK'),
            cancelLabel: options.cancelLabel || 'Cancel',
            resolve,
        });
    }), []);

    const alertDialog = useCallback((message, options) => openDialog('alert', message, options), [openDialog]);
    const confirmDialog = useCallback((message, options) => openDialog('confirm', message, options), [openDialog]);

    const resolveDialog = useCallback((result) => {
        setDialog((current) => {
            if (current) current.resolve(result);
            return null;
        });
    }, []);

    const value = useMemo(() => ({ alertDialog, confirmDialog }), [alertDialog, confirmDialog]);
    const tone = toneMap[dialog?.tone] || toneMap.info;
    const Icon = tone.icon;

    return (
        <DialogContext.Provider value={value}>
            {children}
            <Modal
                isOpen={Boolean(dialog)}
                onClose={() => resolveDialog(dialog?.kind === 'confirm' ? false : undefined)}
                title={dialog?.title || ''}
            >
                {dialog && (
                    <div className="space-y-6">
                        <div className="flex items-start gap-4">
                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ${tone.iconClass}`}>
                                <Icon className="h-5 w-5" />
                            </div>
                            <p className="whitespace-pre-line pt-1 text-sm leading-6 text-gray-600">
                                {dialog.message}
                            </p>
                        </div>

                        <div className="flex justify-end gap-3">
                            {dialog.kind === 'confirm' && (
                                <button
                                    type="button"
                                    onClick={() => resolveDialog(false)}
                                    className="inline-flex h-10 items-center justify-center rounded-full border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                    {dialog.cancelLabel}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => resolveDialog(dialog.kind === 'confirm' ? true : undefined)}
                                className={`inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold transition-colors ${tone.primaryClass}`}
                            >
                                {dialog.confirmLabel}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </DialogContext.Provider>
    );
}

export function useDialog() {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used inside DialogProvider');
    }
    return context;
}
