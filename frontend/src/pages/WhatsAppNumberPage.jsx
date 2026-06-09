import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    Clock3,
    Loader2,
    PhoneCall,
    ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`

const initialForm = {
    business_name: '',
    country: 'India',
    preferred_region: '',
    use_case: '',
    expected_monthly_messages: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
}

const statusLabels = {
    requested: 'Requested',
    in_review: 'In review',
    number_arranged: 'Number arranged',
    meta_onboarding_pending: 'Meta onboarding pending',
    connected: 'Connected',
    cancelled: 'Cancelled',
}

export default function WhatsAppNumberPage() {
    const { user, apiCall } = useAuth()
    const [form, setForm] = useState(() => ({
        ...initialForm,
        business_name: user?.user_metadata?.organization_name || '',
        contact_name: user?.user_metadata?.full_name || '',
        contact_email: user?.email || '',
    }))
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    useEffect(() => {
        loadRequests()
    }, [])

    const loadRequests = async () => {
        setLoading(true)
        try {
            const res = await apiCall(`${API_BASE}/whatsapp/number-requests`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to load requests')
            setRequests(Array.isArray(data.requests) ? data.requests : [])
        } catch (err) {
            setError(err.message || 'Failed to load number requests')
        } finally {
            setLoading(false)
        }
    }

    const updateField = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }))
        setError('')
        setSuccess('')
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        setSubmitting(true)
        setError('')
        setSuccess('')
        try {
            const payload = {
                ...form,
                expected_monthly_messages: form.expected_monthly_messages === '' ? null : Number(form.expected_monthly_messages),
            }
            const res = await apiCall(`${API_BASE}/whatsapp/number-requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Could not submit request')
            setRequests(prev => [data.request, ...prev])
            setSuccess('Request submit ho gayi. Team review karke next onboarding step update karegi.')
            setForm(prev => ({
                ...initialForm,
                country: prev.country || 'India',
                contact_name: prev.contact_name,
                contact_email: prev.contact_email,
                contact_phone: prev.contact_phone,
            }))
        } catch (err) {
            setError(err.message || 'Could not submit request')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 pb-20">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                            <PhoneCall className="h-3.5 w-3.5" />
                            Assisted business number
                        </div>
                        <h1 className="mt-4 text-2xl font-semibold text-gray-950">Request a new WhatsApp business number</h1>
                        <p className="mt-2 text-sm leading-6 text-gray-600">
                            Fresh dedicated number production Cloud API ke liye best hota hai. Request submit karo; team number sourcing, OTP coordination aur official Meta onboarding steps assist karegi.
                        </p>
                    </div>
                    <Link to="/whatsapp-connect" className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                        Connect existing number
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                    <h2 className="text-lg font-semibold text-gray-950">Business requirement</h2>
                    <p className="mt-1 text-sm text-gray-500">Accurate details dene se number arrangement aur Meta approval flow faster hota hai.</p>

                    {error && <InlineNotice tone="danger" text={error} />}
                    {success && <InlineNotice tone="success" text={success} />}

                    <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Business name" required>
                            <input value={form.business_name} onChange={e => updateField('business_name', e.target.value)} className={inputClass} placeholder="Acme Services Pvt Ltd" />
                        </Field>
                        <Field label="Country" required>
                            <input value={form.country} onChange={e => updateField('country', e.target.value)} className={inputClass} placeholder="India" />
                        </Field>
                        <Field label="Preferred city/state">
                            <input value={form.preferred_region} onChange={e => updateField('preferred_region', e.target.value)} className={inputClass} placeholder="Delhi NCR, Maharashtra..." />
                        </Field>
                        <Field label="Expected monthly messages">
                            <input type="number" min="0" value={form.expected_monthly_messages} onChange={e => updateField('expected_monthly_messages', e.target.value)} className={inputClass} placeholder="10000" />
                        </Field>
                        <Field label="Contact name">
                            <input value={form.contact_name} onChange={e => updateField('contact_name', e.target.value)} className={inputClass} placeholder="Owner / admin name" />
                        </Field>
                        <Field label="Contact email">
                            <input type="email" value={form.contact_email} onChange={e => updateField('contact_email', e.target.value)} className={inputClass} placeholder="admin@business.com" />
                        </Field>
                        <Field label="Contact phone">
                            <input value={form.contact_phone} onChange={e => updateField('contact_phone', e.target.value)} className={inputClass} placeholder="+91..." />
                        </Field>
                        <div className="hidden sm:block" />
                        <Field label="Business use case" required className="sm:col-span-2">
                            <textarea
                                value={form.use_case}
                                onChange={e => updateField('use_case', e.target.value)}
                                rows={5}
                                className={`${inputClass} resize-none`}
                                placeholder="Example: customer support, abandoned cart reminders, appointment updates, marketing campaigns..."
                            />
                        </Field>
                    </div>

                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                        Official Cloud API me Meta policies, opt-in, business verification, display name review aur number OTP mandatory ho sakte hain. Ye request in steps ko simplify/track karne ke liye hai.
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400 sm:w-auto"
                    >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        Submit number request
                    </button>
                </form>

                <div className="space-y-6">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-950">Official setup path</h2>
                        <div className="mt-5 space-y-4">
                            {[
                                ['1', 'Request review', 'Team use case, country, compliance and availability check karegi.'],
                                ['2', 'Number arrangement', 'Fresh/dedicated number source karke OTP handoff plan banega.'],
                                ['3', 'Meta onboarding', 'Business details, WABA, display name and phone verification complete hoga.'],
                                ['4', 'Connect and launch', 'Number platform me connect hote hi wallet, templates, chats and campaigns ready honge.'],
                            ].map(([step, title, text]) => (
                                <div key={step} className="flex gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">{step}</span>
                                    <span>
                                        <span className="block text-sm font-semibold text-gray-950">{title}</span>
                                        <span className="mt-1 block text-xs leading-5 text-gray-500">{text}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <div className="border-b border-gray-100 p-5 sm:p-6">
                            <h2 className="text-lg font-semibold text-gray-950">Recent requests</h2>
                            <p className="mt-1 text-sm text-gray-500">Aapke organization ke latest number requests.</p>
                        </div>
                        <div className="p-5 sm:p-6">
                            {loading ? (
                                <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading requests...
                                </div>
                            ) : requests.length ? (
                                <div className="space-y-3">
                                    {requests.map(item => <RequestCard key={item.id} request={item} />)}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                                    Abhi koi number request submit nahi hui.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100'

function Field({ label, required, className = '', children }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
                {label} {required && <span className="text-red-500">*</span>}
            </span>
            {children}
        </label>
    )
}

function InlineNotice({ tone, text }) {
    const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
    const classes = tone === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
    return (
        <div className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${classes}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{text}</span>
        </div>
    )
}

function RequestCard({ request }) {
    const isDone = request.status === 'connected'
    return (
        <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-950">{request.business_name}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">{request.country}{request.preferred_region ? `, ${request.preferred_region}` : ''}</p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${isDone ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                    {isDone ? <ShieldCheck className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
                    {statusLabels[request.status] || request.status}
                </span>
            </div>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-gray-500">{request.use_case}</p>
            {request.admin_notes && (
                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">{request.admin_notes}</p>
            )}
        </div>
    )
}
