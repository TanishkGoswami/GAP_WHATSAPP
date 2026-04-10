import { useState } from 'react'
import { Send, Users, FileText, Calendar, Check, ArrowRight, Play, LayoutGrid } from 'lucide-react'
import { format } from 'date-fns'

const STEPS = [
    { id: 1, name: 'Details', icon: LayoutGrid },
    { id: 2, name: 'Audience', icon: Users },
    { id: 3, name: 'Content', icon: FileText },
    { id: 4, name: 'Review', icon: Check },
]

export default function Broadcast() {
    const [currentStep, setCurrentStep] = useState(1)
    const [campaign, setCampaign] = useState({
        name: '',
        scheduledAt: '',
        audienceTag: '',
        templateId: '',
        variables: {}
    })

    const handleNext = () => setCurrentStep(p => Math.min(4, p + 1))
    const handleBack = () => setCurrentStep(p => Math.max(1, p - 1))

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
                    <p className="text-sm text-gray-500 mt-1">Send bulk messages to your audience</p>
                </div>
            </div>

            {/* Progress Steps */}
            <div className="relative after:absolute after:inset-x-0 after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:bg-gray-200">
                <div className="relative z-10 flex justify-between">
                    {STEPS.map((step) => {
                        const isActive = step.id === currentStep
                        const isCompleted = step.id < currentStep
                        return (
                            <div key={step.id} className="flex flex-col items-center bg-gray-50 px-2">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${isActive ? 'border-indigo-600 bg-indigo-600 text-white' :
                                        isCompleted ? 'border-green-500 bg-green-500 text-white' :
                                            'border-gray-300 bg-white text-gray-400'
                                    }`}>
                                    <step.icon className="h-5 w-5" />
                                </div>
                                <span className={`mt-2 text-xs font-medium ${isActive ? 'text-indigo-600' : 'text-gray-500'}`}>
                                    {step.name}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Step Content */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 min-h-[400px]">
                {currentStep === 1 && (
                    <div className="max-w-md mx-auto space-y-6">
                        <div className="text-center mb-8">
                            <h2 className="text-lg font-medium text-gray-900">Campaign Details</h2>
                            <p className="text-sm text-gray-500">Give your campaign a name and schedule it.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                placeholder="e.g. Summer Sale Announcement"
                                value={campaign.name}
                                onChange={e => setCampaign({ ...campaign, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (Optional)</label>
                            <input
                                type="datetime-local"
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                                value={campaign.scheduledAt}
                                onChange={e => setCampaign({ ...campaign, scheduledAt: e.target.value })}
                            />
                            <p className="text-xs text-gray-500 mt-1">Leave empty to send immediately.</p>
                        </div>
                    </div>
                )}

                {currentStep === 2 && (
                    <div className="max-w-2xl mx-auto space-y-6">
                        <div className="text-center mb-8">
                            <h2 className="text-lg font-medium text-gray-900">Select Audience</h2>
                            <p className="text-sm text-gray-500">Who should receive this message?</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {['All Contacts', 'VIP Customers', 'Leads', 'New Signups'].map((tag) => (
                                <label key={tag} className={`
                                    relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none
                                    ${campaign.audienceTag === tag ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white hover:bg-gray-50'}
                                `}>
                                    <input
                                        type="radio"
                                        name="audience"
                                        className="sr-only"
                                        checked={campaign.audienceTag === tag}
                                        onChange={() => setCampaign({ ...campaign, audienceTag: tag })}
                                    />
                                    <span className="flex flex-1">
                                        <span className="flex flex-col">
                                            <span className="block text-sm font-medium text-gray-900">{tag}</span>
                                            <span className="mt-1 flex items-center text-sm text-gray-500">
                                                <Users className="h-4 w-4 mr-1" />
                                                {Math.floor(Math.random() * 500) + 50} contacts
                                            </span>
                                        </span>
                                    </span>
                                    <Check className={`h-5 w-5 ${campaign.audienceTag === tag ? 'text-indigo-600' : 'invisible'}`} />
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {currentStep === 3 && (
                    <div className="max-w-4xl mx-auto grid grid-cols-2 gap-8">
                        <div>
                            <h2 className="text-lg font-medium text-gray-900 mb-4">Select Template</h2>
                            <div className="space-y-3 h-[400px] overflow-y-auto pr-2">
                                {['welcome_message', 'order_update', 'promo_offer'].map((tpl) => (
                                    <div
                                        key={tpl}
                                        onClick={() => setCampaign({ ...campaign, templateId: tpl })}
                                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${campaign.templateId === tpl
                                                ? 'border-indigo-500 bg-indigo-50'
                                                : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <div className="font-medium text-gray-900">{tpl}</div>
                                        <div className="text-xs text-gray-500 mt-1">Hello {"{{1}}"}, check out...</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h2 className="text-lg font-medium text-gray-900 mb-4">Map Variables</h2>
                            {campaign.templateId ? (
                                <div className="space-y-4 bg-gray-50 p-6 rounded-xl border border-gray-100">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                            Variable {"{{1}}"} (Name)
                                        </label>
                                        <select className="w-full rounded-md border-gray-300 text-sm">
                                            <option>Full Name</option>
                                            <option>First Name</option>
                                        </select>
                                    </div>
                                    {campaign.templateId === 'order_update' && (
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                                Variable {"{{2}}"} (Order Link)
                                            </label>
                                            <select className="w-full rounded-md border-gray-300 text-sm">
                                                <option>Custom Field: Order URL</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                                    Select a template first
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {currentStep === 4 && (
                    <div className="max-w-lg mx-auto text-center space-y-6">
                        <div className="mx-auto h-16 w-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                            <Send className="h-8 w-8 ml-1" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Ready to Launch?</h2>
                            <p className="text-gray-500 mt-2">
                                You are about to send <strong>{campaign.templateId}</strong> to <strong>{campaign.audienceTag || '0 contacts'}</strong>.
                            </p>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-4 text-left text-sm space-y-2 border border-gray-200">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Cost Estimate</span>
                                <span className="font-medium text-gray-900">~ $4.50</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Schedule</span>
                                <span className="font-medium text-gray-900">{campaign.scheduledAt ? format(new Date(campaign.scheduledAt), 'PPp') : 'Now'}</span>
                            </div>
                        </div>

                        <button className="w-full py-3 bg-green-600 text-white rounded-xl font-bold text-lg hover:bg-green-700 shadow-lg shadow-green-200 transition-all transform hover:scale-[1.02]">
                            {campaign.scheduledAt ? 'Schedule Campaign' : 'Launch Campaign Now'}
                        </button>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-4">
                <button
                    onClick={handleBack}
                    disabled={currentStep === 1}
                    className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Back
                </button>

                {currentStep < 4 && (
                    <button
                        onClick={handleNext}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800"
                    >
                        Next Step <ArrowRight className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    )
}
