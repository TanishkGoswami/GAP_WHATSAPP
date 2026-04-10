import { useState, useRef } from 'react'
import { Upload, X, FileSpreadsheet, Check } from 'lucide-react'

export default function BulkImportModal({ isOpen, onClose }) {
    const [step, setStep] = useState(1) // 1: Upload, 2: Map, 3: Success
    const [file, setFile] = useState(null)
    const [mapping, setMapping] = useState({
        name: 'Full Name',
        phone: 'Phone Number',
        email: 'Email Address'
    })
    const fileInputRef = useRef(null)

    if (!isOpen) return null

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0]
        if (selectedFile) {
            setFile(selectedFile)
            setStep(2)
        }
    }

    const handleImport = () => {
        // Simulate import process
        setTimeout(() => {
            setStep(3)
        }, 1500)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-100 p-6">
                    <h2 className="text-xl font-bold text-gray-900">Import Contacts</h2>
                    <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6">
                    {step === 1 && (
                        <div
                            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-12 px-6 text-center hover:bg-gray-100 transition-colors cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".csv,.xlsx"
                                onChange={handleFileChange}
                            />
                            <div className="mb-4 rounded-full bg-indigo-100 p-4 text-indigo-600">
                                <Upload className="h-8 w-8" />
                            </div>
                            <h3 className="mb-1 text-lg font-semibold text-gray-900">Upload CSV or Excel</h3>
                            <p className="text-sm text-gray-500">Drag and drop your file here or click to browse</p>
                            <p className="mt-4 text-xs text-gray-400">Supported formats: .csv, .xlsx</p>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="flex items-center gap-3 rounded-lg bg-indigo-50 p-3 text-indigo-700">
                                <FileSpreadsheet className="h-5 w-5" />
                                <span className="font-medium truncate">{file?.name}</span>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-medium text-gray-900">Map Columns</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-500 uppercase">System Field</label>
                                        <div className="p-2 bg-gray-50 rounded border border-gray-200 text-sm font-medium">Name</div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-500 uppercase">CSV Column</label>
                                        <select className="w-full p-2 bg-white rounded border border-gray-300 text-sm outline-none focus:border-indigo-500">
                                            <option>Full Name</option>
                                            <option>First Name</option>
                                        </select>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="p-2 bg-gray-50 rounded border border-gray-200 text-sm font-medium">Phone</div>
                                    </div>
                                    <div className="space-y-1">
                                        <select className="w-full p-2 bg-white rounded border border-gray-300 text-sm outline-none focus:border-indigo-500">
                                            <option>Phone Number</option>
                                            <option>Mobile</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handleImport}
                                    className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                                >
                                    Start Import
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="text-center py-8">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                                <Check className="h-8 w-8" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Import Successful!</h3>
                            <p className="mt-2 text-sm text-gray-500">Added 124 new contacts to your list.</p>
                            <button
                                onClick={onClose}
                                className="mt-8 rounded-lg bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800"
                            >
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
