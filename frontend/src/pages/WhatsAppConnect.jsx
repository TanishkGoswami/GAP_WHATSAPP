import { createElement, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
    AlertCircle,
    ArrowRight,
    BadgeCheck,
    Building2,
    CheckCircle2,
    FileCheck2,
    HelpCircle,
    KeyRound,
    Loader2,
    MessageSquareText,
    PhoneCall,
    QrCode,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Wallet,
    X,
} from 'lucide-react'
import WhatsAppLogin from '../components/WhatsAppLogin'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import { formatINRFromPaise } from '../config/whatsappPricing'
import TourButton from '../onboarding/TourButton'

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${API_URL}/api`
const META_APP_ID = import.meta.env.VITE_META_APP_ID || '1459710399100167'
const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID || '1108075894853600'
const META_EMBEDDED_SIGNUP_VERSION = import.meta.env.VITE_META_EMBEDDED_SIGNUP_VERSION || 'v4'
const META_EMBEDDED_SESSION_INFO_VERSION = import.meta.env.VITE_META_EMBEDDED_SESSION_INFO_VERSION || '3'

export default function WhatsAppConnect() {
    const { session, apiCall } = useAuth()
    const { alertDialog, confirmDialog } = useDialog()
    const [accounts, setAccounts] = useState([])
    const [loadingAccounts, setLoadingAccounts] = useState(true)
    const [billing, setBilling] = useState(null)
    const [embedStatus, setEmbedStatus] = useState('idle')
    const [embedError, setEmbedError] = useState('')
    const [manualOpen, setManualOpen] = useState(true)
    const [manualCreds, setManualCreds] = useState({ businessAccountId: '', accessToken: '' })
    const [manualPhoneNumbers, setManualPhoneNumbers] = useState([])
    const [manualSelectedPhoneId, setManualSelectedPhoneId] = useState('')
    const [manualStatus, setManualStatus] = useState('idle')
    const [manualError, setManualError] = useState('')
    const [diagnostics, setDiagnostics] = useState({})
    const [diagnosticsLoadingId, setDiagnosticsLoadingId] = useState(null)

    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    const isSecureForMetaLogin = window.location.protocol === 'https:' || isLocalHost
    const activeConnections = useMemo(() => accounts, [accounts])

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
            return list
        } catch {
            setAccounts([])
            return []
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
            setEmbedError('')
            if (Array.isArray(data.accounts) && data.accounts.length > 0) {
                setAccounts(prev => mergeAccounts(prev, data.accounts))
            }
            await fetchAccounts()
            await fetchBilling()
            setTimeout(() => setEmbedStatus('idle'), 5000)
        } catch (err) {
            const refreshedAccounts = await fetchAccounts()
            await fetchBilling()
            const hasConnectedMetaAccount = refreshedAccounts.some(acc => acc.connection_type === 'meta_cloud_api' || acc.whatsapp_business_account_id)
            if (hasConnectedMetaAccount && String(err.message || '').toLowerCase().includes('limit reached')) {
                setEmbedError('')
                setEmbedStatus('saved')
                setTimeout(() => setEmbedStatus('idle'), 5000)
                return
            }
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
            <section className="overflow-hidden rounded-lg border border-[#b9dcfb] bg-white">
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_360px]">
                    <div className="border-b border-[#d9ecfd] bg-[#eef7ff] p-5 sm:p-6 lg:border-b-0 lg:border-r">
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#b9dcfb] bg-white px-3 py-1 text-xs font-semibold text-[#0064b7]">
                            <Sparkles className="h-3.5 w-3.5" />
                            Start here
                        </div>
                        <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-gray-950">Connect WhatsApp so your dashboard, chats, broadcasts and automations can start working.</h1>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-700">
                            Simple meaning: aapka business WhatsApp number is platform se link hoga. Connection ke baad messages sync honge, templates create honge, wallet billing track hogi, and AI/flows ko real inbox access milega.
                        </p>
                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={handleEmbeddedSignup}
                                data-tour="connect-primary"
                                disabled={embedStatus === 'loading' || embedStatus === 'saving'}
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#0070d1] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0064b7] disabled:cursor-not-allowed disabled:bg-[#79b8ef]"
                            >
                                {embedStatus === 'loading' || embedStatus === 'saving' ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {embedStatus === 'saving' ? 'Saving account...' : 'Opening Meta signup...'}
                                    </>
                                ) : (
                                    <>
                                        <Smartphone className="h-4 w-4" />
                                        Connect WhatsApp account
                                    </>
                                )}
                            </button>
                            <Link
                                to="/whatsapp-number"
                                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-6 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                            >
                                <PhoneCall className="h-4 w-4" />
                                I need a new number
                            </Link>
                            <TourButton />
                        </div>
                    </div>
                    <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-1">
                        <MiniMetric icon={Wallet} label="Wallet" value={formatINRFromPaise(walletBalance)} tone="green" />
                        <MiniMetric icon={FileCheck2} label="This month spend" value={formatINRFromPaise(monthSpend)} tone="blue" />
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <GuideCard
                    icon={Building2}
                    title="Before you start"
                    items={[
                        'Facebook/Meta admin login ready rakhein.',
                        'Business name, website and email accurate honi chahiye.',
                        'Number par SMS/call OTP receive kar paana zaroori hai.',
                    ]}
                />
                <GuideCard
                    icon={BadgeCheck}
                    title="Meta will verify"
                    items={[
                        'Business portfolio select ya create hoga.',
                        'WhatsApp Business Account and phone number link hoga.',
                        'Some accounts may need Meta review before full sending.',
                    ]}
                />
                <GuideCard
                    icon={MessageSquareText}
                    title="After connection"
                    items={[
                        'Dashboard zero values real message data se replace honge.',
                        'Templates, broadcasts, live chat and flows unlock honge.',
                        'Diagnostics batayega number send-ready hai ya kya pending hai.',
                    ]}
                />
            </section>

            {activeConnections.length > 0 && (
                <section data-tour="connect-accounts" className="mb-10 mt-6">
                    <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-800">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Live Status
                            </div>
                            <h2 className="mt-4 text-[28px] font-bold tracking-tight text-gray-950">Active WhatsApp Connections</h2>
                            <p className="mt-1.5 text-[15px] text-gray-500">Your connected numbers are ready for messaging, templates, and automations.</p>
                        </div>
                        <Link to="/billing" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-50">
                            <Wallet className="h-4 w-4" />
                            Recharge wallet
                        </Link>
                    </div>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        {activeConnections.map(account => (
                            <AccountCard
                                key={account.id}
                                account={account}
                                diagnostics={diagnostics[account.id]}
                                loading={diagnosticsLoadingId === account.id}
                                onCheck={() => runAccountDiagnostics(account.id)}
                                onReconnect={handleEmbeddedSignup}
                                onDisconnect={() => handleDeleteAccount(account.id)}
                            />
                        ))}
                    </div>
                </section>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
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
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 lg:max-w-sm">
                        <p className="font-semibold">Tip for first-time users</p>
                        <p className="mt-1">Agar aapko WABA, token, phone number ID jaise words confusing lag rahe hain, bas recommended Meta button use karein. Manual token setup advanced users ke liye hai.</p>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <div data-tour="connect-primary" className="rounded-lg border border-[#b9dcfb] bg-white lg:col-span-3">
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
                                    <Smartphone className="h-4 w-4" />
                                    Connect WhatsApp with Meta
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

                <div className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6 lg:col-span-2">
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

            {activeConnections.length === 0 && (
                <section data-tour="connect-accounts" className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-950">Connected numbers</h2>
                            <p className="mt-1 text-sm text-gray-500">Connection ke baad yahan send readiness, wallet and next actions visible rahenge.</p>
                        </div>
                    </div>
                    <div className="p-5 sm:p-6">
                        {loadingAccounts ? (
                            <div className="flex min-h-32 items-center justify-center text-sm text-gray-500">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading accounts...
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-[#b9dcfb] bg-[#eef7ff] p-6 text-center">
                                <p className="text-sm font-semibold text-gray-950">No official Cloud API number connected yet.</p>
                                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">Connect with Meta for existing number, ya new dedicated number request karein.</p>
                                <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={handleEmbeddedSignup}
                                        disabled={embedStatus === 'loading' || embedStatus === 'saving'}
                                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0070d1] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0064b7] disabled:bg-[#79b8ef]"
                                    >
                                        <Smartphone className="h-4 w-4" />
                                        Connect now
                                    </button>
                                    <Link to="/whatsapp-number" className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                                        <PhoneCall className="h-4 w-4" />
                                        New number
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            )}

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div data-tour="connect-manual" className="rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
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
                            <div className="pt-3">
                                <div className="overflow-hidden rounded-xl border border-gray-100 shadow-sm">
                                    <video
                                        src="https://v1.pinimg.com/videos/iht/expMp4/f0/9b/a6/f09ba694033f34eb5017ec4a8101ef5f_720w.mp4"
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                        className="w-full h-auto object-cover"
                                    />
                                </div>
                            </div>
                        </form>
                    )}
                </div>

                <div className="rounded-lg border border-amber-200 bg-white p-5 sm:p-6">
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

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <InfoBox title="Can I use my existing number?" text="Haan, but number WhatsApp Cloud API me migrate/link hoga. Agar number already WhatsApp mobile app me active hai, Meta flow ke during instructions follow karni padengi." />
                <InfoBox title="Why templates are needed?" text="Customer ko first message ya broadcast bhejne ke liye Meta-approved templates required hote hain. Customer reply kare to normal service conversation open hoti hai." />
                <InfoBox title="What if I am not technical?" text="Recommended Meta signup button use karein. Manual token section ko ignore kar sakte hain unless support team specifically bole." />
            </section>
        </div>
    )
}

function mergeAccounts(currentAccounts, incomingAccounts) {
    const byId = new Map(currentAccounts.map(account => [account.id, account]))
    incomingAccounts.forEach(account => {
        if (!account?.id) return
        byId.set(account.id, { ...byId.get(account.id), ...account })
    })
    return Array.from(byId.values()).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

function GuideCard({ icon, title, items }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef7ff] text-[#0064b7]">
                    {createElement(icon, { className: 'h-5 w-5' })}
                </span>
                <h2 className="text-base font-semibold text-gray-950">{title}</h2>
            </div>
            <ul className="mt-4 space-y-2">
                {items.map(item => (
                    <li key={item} className="flex gap-2 text-sm leading-6 text-gray-600">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function InfoBox({ title, text }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                <HelpCircle className="h-4 w-4 text-[#0064b7]" />
                {title}
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">{text}</p>
        </div>
    )
}

function MiniMetric({ icon, label, value, tone }) {
    const toneClass = tone === 'green' ? 'text-emerald-600 bg-emerald-50' : 'text-blue-600 bg-blue-50'
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500">{label}</p>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
                    {createElement(icon, { className: 'h-4 w-4' })}
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

function AccountCard({ account, diagnostics, loading, onCheck, onReconnect, onDisconnect }) {
    const ready = diagnostics?.send_ready ?? account.send_ready
    const issueCodes = diagnostics?.issue_codes || []
    const reconnectRequired = diagnostics?.reconnect_required || issueCodes.includes('token_expired') || issueCodes.includes('token_missing')
    const summary = getAccountSummary(account, diagnostics, reconnectRequired)
    const statusLabel = ready ? 'Active' : reconnectRequired ? 'Reconnect Required' : 'Action Needed'
    const messagingStatus = ready ? 'Send Ready' : reconnectRequired ? 'Paused' : 'Limited'
    const templateStatus = ready ? 'Unlocked' : reconnectRequired ? 'Reconnect' : 'Needs Check'
    const noticeClass = ready
        ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
        : reconnectRequired
            ? 'border-red-100 bg-red-50 text-red-900'
            : 'border-amber-100 bg-amber-50 text-amber-900'

    return (
        <div className="flex flex-col justify-between rounded-[20px] border border-gray-100 bg-white p-6 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.05)] ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-gray-50 border border-gray-100 text-gray-900">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                        </svg>
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-[22px] font-bold tracking-tight text-gray-950">
                            {account.display_phone_number || account.phone_number_id || 'WhatsApp number'}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 truncate text-[13px] font-medium text-gray-500">
                            {account.connection_type === 'qr_session' ? 'QR Session Connection' : `WABA: ${maskId(account.whatsapp_business_account_id) || 'Pending'}`}
                        </p>
                    </div>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${ready ? 'bg-emerald-50 text-emerald-800' : reconnectRequired ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-600' : reconnectRequired ? 'bg-red-600' : 'bg-amber-500'}`} />
                    {statusLabel}
                </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatusTile label="MESSAGING" value={messagingStatus} />
                <StatusTile label="TEMPLATES" value={account.connection_type === 'qr_session' ? 'Not Required' : templateStatus} />
                <StatusTile label="INTEGRATION" value={account.connection_type === 'qr_session' ? 'QR Session' : 'Cloud API'} />
            </div>

            <div className={`mt-6 flex items-start gap-3 rounded-[12px] p-4 text-[14px] font-medium border ${noticeClass}`}>
                {ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}
                <p className="leading-5">{summary || 'Run diagnostics to verify live Meta permissions.'}</p>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                    {reconnectRequired && (
                        <button
                            type="button"
                            onClick={onReconnect}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0070d1] px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#0064b7]"
                        >
                            <Smartphone className="h-4 w-4" />
                            Reconnect Meta
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onCheck}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-200 transition-all hover:bg-gray-50 disabled:opacity-60"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-500" /> : <ShieldCheck className="h-4 w-4 text-gray-500" />}
                        Verify Access
                    </button>
                    {!reconnectRequired && account.connection_type !== 'qr_session' && (
                        <Link
                            to="/templates"
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-gray-800"
                        >
                            <MessageSquareText className="h-4 w-4" />
                            Manage Templates
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={onDisconnect}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-200 transition-all hover:bg-gray-50"
                    >
                        Disconnect
                    </button>
                </div>
            </div>
        </div>
    )
}

function getAccountSummary(account, diagnostics, reconnectRequired) {
    if (account.connection_type === 'qr_session') {
        return diagnostics?.send_ready ?? account.send_ready
            ? 'QR testing session is connected and ready for messaging.'
            : 'QR testing session is disconnected. Scan the QR code below to reconnect.'
    }
    if (diagnostics?.send_ready) return 'Cloud API send access verified. Ready for production.'
    if (reconnectRequired) {
        return 'Meta token expire ho gaya hai. Reconnect Meta click karke same number ko fresh permission ke saath link karein; uske baad sending, templates and profile access restore ho jayega.'
    }
    if (diagnostics?.issues?.length) return diagnostics.issues.join(', ')
    return account.diagnostics_summary
}

function StatusTile({ label, value }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-[12px] border border-gray-100 bg-white p-3 text-center shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
            <p className="mt-1 w-full truncate text-[13px] font-bold text-gray-900">{value}</p>
        </div>
    )
}

function maskId(value) {
    if (!value) return ''
    const text = String(value)
    if (text.length <= 8) return text
    return `${text.slice(0, 4)}...${text.slice(-4)}`
}
