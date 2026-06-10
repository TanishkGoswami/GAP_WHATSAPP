import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    FileCheck2,
    KeyRound,
    Loader2,
    PhoneCall,
    QrCode,
    ShieldCheck,
    Wallet,
    X,
} from 'lucide-react'
import WhatsAppLogin from '../components/WhatsAppLogin'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { formatINRFromPaise } from '../config/whatsappPricing'

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${API_URL}/api`
const META_APP_ID = import.meta.env.VITE_META_APP_ID || '1459710399100167'
const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID || '1108075894853600'
const META_EMBEDDED_SIGNUP_VERSION = import.meta.env.VITE_META_EMBEDDED_SIGNUP_VERSION || 'v4'
const META_EMBEDDED_SESSION_INFO_VERSION = import.meta.env.VITE_META_EMBEDDED_SESSION_INFO_VERSION || '3'

export default function WhatsAppConnect() {
    const { user, session, apiCall } = useAuth()
    const { alertDialog, confirmDialog } = useDialog()
    const [accounts, setAccounts] = useState([])
    const [loadingAccounts, setLoadingAccounts] = useState(true)
    const [billing, setBilling] = useState(null)
    const [embedStatus, setEmbedStatus] = useState('idle')
    const [embedError, setEmbedError] = useState('')
    const [manualOpen, setManualOpen] = useState(false)
    const [manualCreds, setManualCreds] = useState({ businessAccountId: '', accessToken: '' })
    const [manualPhoneNumbers, setManualPhoneNumbers] = useState([])
    const [manualSelectedPhoneId, setManualSelectedPhoneId] = useState('')
    const [manualStatus, setManualStatus] = useState('idle')
    const [manualError, setManualError] = useState('')
    const [diagnostics, setDiagnostics] = useState({})
    const [diagnosticsLoadingId, setDiagnosticsLoadingId] = useState(null)

    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    const isSecureForMetaLogin = window.location.protocol === 'https:' || isLocalHost
    const metaAccounts = useMemo(() => accounts.filter(acc => acc.connection_type === 'meta_cloud_api' || acc.whatsapp_business_account_id), [accounts])

    useEffect(() => {
        if (!session?.access_token) return
        fetchAccounts()
        fetchBilling()
    }, [session?.access_token])

    useEffect(() => {
        if (!window.FB) return
        window.FB.init({ appId: META_APP_ID, cookie: true, xfbml: true, version: 'v18.0' })
    }, [])

    const getAuthHeader = () => {
        const token = session?.access_token
        return token ? { Authorization: `Bearer ${token}` } : {}
    }

    const fetchBilling = async () => {
        try {
            const res = await apiCall(`${API_BASE}/billing/overview`)
            const data = await res.json().catch(() => ({}))
            if (res.ok) setBilling(data)
        } catch {
            setBilling(null)
        }
    }

    const fetchAccounts = async () => {
        setLoadingAccounts(true)
        try {
            const res = await fetch(`${API_BASE}/whatsapp/accounts`, {
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            })
            const data = await res.json().catch(() => [])
            const list = Array.isArray(data) ? data : []
            setAccounts(list)
            list.filter(acc => acc.connection_type === 'meta_cloud_api' || acc.whatsapp_business_account_id)
                .slice(0, 3)
                .forEach(acc => runAccountDiagnostics(acc.id, { silent: true }))
        } catch {
            setAccounts([])
        } finally {
            setLoadingAccounts(false)
        }
    }

    const runAccountDiagnostics = async (id, options = {}) => {
        if (!options.silent) setDiagnosticsLoadingId(id)
        try {
            const res = await fetch(`${API_BASE}/whatsapp/accounts/${id}/diagnostics`, {
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to inspect account')
            setDiagnostics(prev => ({ ...prev, [id]: data }))
        } catch (err) {
            setDiagnostics(prev => ({ ...prev, [id]: { send_ready: false, issues: [err.message] } }))
        } finally {
            if (!options.silent) setDiagnosticsLoadingId(null)
        }
    }

    const handleDeleteAccount = async (id) => {
        const confirmed = await confirmDialog('Disconnect this WhatsApp account?', {
            title: 'Disconnect account',
            tone: 'danger',
            confirmLabel: 'Disconnect',
        })
        if (!confirmed) return

        try {
            const res = await fetch(`${API_BASE}/whatsapp/accounts/${id}`, {
                method: 'DELETE',
                headers: { ...getAuthHeader() },
            })
            if (res.ok) setAccounts(prev => prev.filter(a => a.id !== id))
        } catch {
            alertDialog('Failed to disconnect account', { title: 'Disconnect failed', tone: 'danger' })
        }
    }

    const handleEmbeddedSignupResponse = async (response) => {
        if (!response.authResponse?.code) {
            setEmbedStatus('idle')
            return
        }

        setEmbedStatus('saving')
        setEmbedError('')
        try {
            const res = await fetch(`${API_BASE}/wa/connect/callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({ code: response.authResponse.code }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Connection failed')
            setEmbedStatus('saved')
            await fetchAccounts()
            await fetchBilling()
            setTimeout(() => setEmbedStatus('idle'), 5000)
        } catch (err) {
            setEmbedError(err.message || 'Connection failed')
            setEmbedStatus('error')
        }
    }

    const handleEmbeddedSignup = () => {
        if (!isSecureForMetaLogin) {
            setEmbedStatus('error')
            setEmbedError('Meta login requires HTTPS. Use your deployed URL or HTTPS ngrok URL.')
            return
        }
        if (!window.FB) {
            alertDialog('Facebook SDK is loading. Try again in a moment.', { title: 'Meta login not ready', tone: 'warning' })
            return
        }

        setEmbedStatus('loading')
        setEmbedError('')
        window.FB.login((response) => handleEmbeddedSignupResponse(response), {
            config_id: META_CONFIG_ID,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
                setup: {},
                featureType: '',
                sessionInfoVersion: META_EMBEDDED_SESSION_INFO_VERSION,
                version: META_EMBEDDED_SIGNUP_VERSION,
            },
        })
    }

    const handleManualConnect = async (event) => {
        event.preventDefault()
        const businessAccountId = manualCreds.businessAccountId.trim()
        const accessToken = manualCreds.accessToken.trim()
        if (!businessAccountId || !accessToken) {
            setManualError('Please enter both WABA ID and access token.')
            return
        }

        if (manualPhoneNumbers.length === 0) {
            setManualStatus('validating')
            setManualError('')
            try {
                const res = await fetch(`https://graph.facebook.com/v21.0/${businessAccountId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`)
                const data = await res.json()
                if (data.error) throw new Error(data.error.message)
                if (!data.data?.length) throw new Error('No phone numbers found for this WABA.')
                setManualPhoneNumbers(data.data)
                setManualSelectedPhoneId(data.data[0].id)
                setManualStatus('idle')
            } catch (err) {
                setManualError(err.message)
                setManualStatus('error')
            }
            return
        }

        setManualStatus('saving')
        setManualError('')
        try {
            const selectedPhone = manualPhoneNumbers.find(p => p.id === manualSelectedPhoneId)
            const res = await fetch(`${API_BASE}/whatsapp/accounts/meta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({
                    phone_number_id: manualSelectedPhoneId,
                    waba_id: businessAccountId,
                    access_token: accessToken,
                    display_phone_number: selectedPhone?.display_phone_number || '',
                    name: selectedPhone?.verified_name || 'WhatsApp Business',
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'Failed to save account')
            setManualStatus('saved')
            setManualCreds({ businessAccountId: '', accessToken: '' })
            setManualPhoneNumbers([])
            setManualSelectedPhoneId('')
            await fetchAccounts()
        } catch (err) {
            setManualError(err.message)
            setManualStatus('error')
        }
    }

    const walletBalance = billing?.wallet?.balance_paise || 0
    const monthSpend = billing?.spend?.month_spend_paise || 0

    return (
        <div className="mx-auto max-w-7xl space-y-6 pb-20">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Official WhatsApp Cloud API
                        </div>
                        <h1 className="mt-4 text-2xl font-semibold text-gray-950">Connect your business WhatsApp number</h1>
                        <p className="mt-2 text-sm leading-6 text-gray-600">
                            Existing business number connect karo, ya fresh dedicated number request karo. Meta admin login, OTP verification aur policy approval official process ka part hai; platform setup ko guided aur trackable banata hai.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
                        <MiniMetric icon={Wallet} label="Wallet" value={formatINRFromPaise(walletBalance)} tone="green" />
                        <MiniMetric icon={FileCheck2} label="This month spend" value={formatINRFromPaise(monthSpend)} tone="blue" />
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <div className="rounded-2xl border border-green-200 bg-white shadow-sm lg:col-span-3">
                    <div className="border-b border-green-100 bg-green-50/80 p-5 sm:p-6">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-green-600 px-3 py-1 text-xs font-bold uppercase text-white">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Recommended
                        </div>
                        <h2 className="text-lg font-semibold text-gray-950">Connect with Meta</h2>
                        <p className="mt-1 text-sm leading-6 text-gray-600">Templates, campaigns, live chat, flows and reliable delivery ke liye official Cloud API use hoga.</p>
                    </div>
                    <div className="space-y-5 p-5 sm:p-6">
                        {embedStatus === 'saved' && <Notice tone="success" title="Number connected" text="Account save ho gaya. Neeche readiness status automatically refresh ho jayega." />}
                        {embedStatus === 'error' && embedError && (
                            <Notice tone="danger" title="Connection failed" text={embedError} onClose={() => { setEmbedStatus('idle'); setEmbedError('') }} />
                        )}
                        {!isSecureForMetaLogin && (
                            <Notice tone="danger" title="HTTPS required" text="Meta login deployed HTTPS ya ngrok HTTPS URL par test karein. Localhost bhi allowed hai." />
                        )}

                        <button
                            type="button"
                            onClick={handleEmbeddedSignup}
                            disabled={embedStatus === 'loading' || embedStatus === 'saving'}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-sm font-bold text-white shadow-md shadow-green-100 transition hover:bg-[#20b956] disabled:cursor-not-allowed disabled:bg-green-400"
                        >
                            {embedStatus === 'loading' || embedStatus === 'saving' ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {embedStatus === 'saving' ? 'Saving account...' : 'Opening Meta signup...'}
                                </>
                            ) : (
                                <>
                                    <PhoneCall className="h-4 w-4" />
                                    Connect with Meta
                                </>
                            )}
                        </button>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                            {[
                                ['1', 'Prepare business', 'Legal name, website and admin access ready rakhein.'],
                                ['2', 'Login with Meta', 'Business portfolio select/create karein.'],
                                ['3', 'Verify number', 'Fresh/dedicated number OTP complete karein.'],
                                ['4', 'Start setup', 'Templates, wallet and automations unlock honge.'],
                            ].map(([step, title, text]) => (
                                <div key={step} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">{step}</div>
                                    <p className="mt-3 text-sm font-semibold text-gray-950">{title}</p>
                                    <p className="mt-1 text-xs leading-5 text-gray-500">{text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-950">Need a new business number?</h2>
                            <p className="mt-2 text-sm leading-6 text-gray-600">Fresh number best hota hai production WhatsApp API ke liye. Request submit karo; team number sourcing aur Meta onboarding assist karegi.</p>
                        </div>
                        <PhoneCall className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                        Official process me number ownership/OTP, business details aur Meta policy approval required hota hai. Hum isko guided service ke form me manage karenge.
                    </div>
                    <Link
                        to="/whatsapp-number"
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
                    >
                        Request new number
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-950">Connected numbers</h2>
                        <p className="mt-1 text-sm text-gray-500">Connection ke baad yahan send readiness, wallet and next actions visible rahenge.</p>
                    </div>
                    <Link to="/billing" className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                        <Wallet className="h-4 w-4" />
                        Recharge wallet
                    </Link>
                </div>
                <div className="p-5 sm:p-6">
                    {loadingAccounts ? (
                        <div className="flex min-h-32 items-center justify-center text-sm text-gray-500">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading accounts...
                        </div>
                    ) : metaAccounts.length ? (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {metaAccounts.map(account => (
                                <AccountCard
                                    key={account.id}
                                    account={account}
                                    diagnostics={diagnostics[account.id]}
                                    loading={diagnosticsLoadingId === account.id}
                                    onCheck={() => runAccountDiagnostics(account.id)}
                                    onDisconnect={() => handleDeleteAccount(account.id)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                            <p className="text-sm font-semibold text-gray-950">No official Cloud API number connected yet.</p>
                            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Connect with Meta for existing number, ya new dedicated number request karein.</p>
                        </div>
                    )}
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                    <button
                        type="button"
                        onClick={() => setManualOpen(prev => !prev)}
                        className="flex w-full items-center justify-between gap-4 text-left"
                    >
                        <span>
                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-950">
                                <KeyRound className="h-4 w-4 text-blue-600" />
                                Advanced manual token setup
                            </span>
                            <span className="mt-1 block text-sm text-gray-500">Only for teams who already have WABA ID, phone number ID and permanent token.</span>
                        </span>
                        <ArrowRight className={`h-4 w-4 text-gray-400 transition ${manualOpen ? 'rotate-90' : ''}`} />
                    </button>
                    {manualOpen && (
                        <form onSubmit={handleManualConnect} className="mt-5 space-y-3">
                            {manualStatus === 'error' && manualError && <Notice tone="danger" title="Manual setup failed" text={manualError} />}
                            {manualStatus === 'saved' && <Notice tone="success" title="Account saved" text="Manual Cloud API account connected successfully." />}
                            <input
                                type="text"
                                autoComplete="off"
                                placeholder="WhatsApp Business Account ID"
                                value={manualCreds.businessAccountId}
                                onChange={e => setManualCreds(prev => ({ ...prev, businessAccountId: e.target.value }))}
                                disabled={manualPhoneNumbers.length > 0}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100 disabled:bg-gray-50"
                            />
                            <input
                                type="text"
                                autoComplete="new-password"
                                placeholder="Access Token"
                                value={manualCreds.accessToken}
                                onChange={e => setManualCreds(prev => ({ ...prev, accessToken: e.target.value }))}
                                disabled={manualPhoneNumbers.length > 0}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100 disabled:bg-gray-50"
                            />
                            {manualPhoneNumbers.length > 0 && (
                                <select
                                    value={manualSelectedPhoneId}
                                    onChange={e => setManualSelectedPhoneId(e.target.value)}
                                    className="w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-100"
                                >
                                    {manualPhoneNumbers.map(phone => (
                                        <option key={phone.id} value={phone.id}>{phone.verified_name} ({phone.display_phone_number})</option>
                                    ))}
                                </select>
                            )}
                            <button
                                type="submit"
                                disabled={manualStatus === 'validating' || manualStatus === 'saving'}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                            >
                                {(manualStatus === 'validating' || manualStatus === 'saving') && <Loader2 className="h-4 w-4 animate-spin" />}
                                {manualPhoneNumbers.length > 0 ? 'Link to platform' : 'Validate access'}
                            </button>
                        </form>
                    )}
                </div>

                <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:p-6">
                    <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase text-amber-800">
                        <QrCode className="h-3.5 w-3.5" />
                        Testing only
                    </div>
                    <h2 className="mt-4 text-lg font-semibold text-gray-950">QR session connection</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">Internal demo/testing ke liye QR use ho sakta hai. Production campaigns, approved templates, reliable delivery aur compliance ke liye official Cloud API hi recommended hai.</p>
                    <div className="mt-5">
                        <WhatsAppLogin onAccountConnected={fetchAccounts} />
                    </div>
                </div>
            </section>
        </div>
    )
}

function MiniMetric({ icon: Icon, label, value, tone }) {
    const toneClass = tone === 'green' ? 'text-emerald-600 bg-emerald-50' : 'text-blue-600 bg-blue-50'
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            <p className="mt-3 text-xl font-semibold text-gray-950">{value}</p>
        </div>
    )
}

function Notice({ tone, title, text, onClose }) {
    const classes = tone === 'success'
        ? 'border-green-200 bg-green-50 text-green-800'
        : 'border-red-200 bg-red-50 text-red-800'
    const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
    return (
        <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${classes}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-xs leading-5">{text}</p>
            </div>
            {onClose && (
                <button type="button" onClick={onClose} className="rounded p-1 hover:bg-white/60">
                    <X className="h-4 w-4" />
                </button>
            )}
        </div>
    )
}

function AccountCard({ account, diagnostics, loading, onCheck, onDisconnect }) {
    const ready = diagnostics?.send_ready ?? account.send_ready
    const summary = diagnostics
        ? (diagnostics.send_ready ? 'Cloud API send access verified.' : diagnostics.issues?.join(', '))
        : account.diagnostics_summary

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-gray-950">{account.display_phone_number || account.phone_number_id || 'WhatsApp number'}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">{maskId(account.whatsapp_business_account_id) || 'WABA pending'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    {ready ? 'Send ready' : 'Needs check'}
                </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatusTile label="Templates" value="Available after approval" />
                <StatusTile label="Connection" value="Meta Cloud API" />
                <StatusTile label="Status" value={account.status || 'connected'} />
            </div>

            <p className={`mt-4 rounded-lg px-3 py-2 text-xs leading-5 ${ready ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
                {summary || 'Run diagnostics to verify live Meta permissions.'}
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                    type="button"
                    onClick={onCheck}
                    disabled={loading}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    Check send access
                </button>
                <Link to="/templates" className="inline-flex flex-1 items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                    Create templates
                </Link>
                <button
                    type="button"
                    onClick={onDisconnect}
                    className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                    Disconnect
                </button>
            </div>
        </div>
    )
}

function StatusTile({ label, value }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-[11px] font-medium uppercase text-gray-400">{label}</p>
            <p className="mt-1 truncate text-xs font-semibold text-gray-800">{value}</p>
        </div>
    )
}

function maskId(value) {
    if (!value) return ''
    const text = String(value)
    if (text.length <= 8) return text
    return `${text.slice(0, 4)}...${text.slice(-4)}`
}
