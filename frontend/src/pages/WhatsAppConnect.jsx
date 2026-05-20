import { useState, useEffect } from 'react';
import {
    Trash2, CheckCircle2, AlertCircle, Loader2, X, ShieldCheck, KeyRound,
    QrCode, Building2, FileCheck2, PhoneCall, LockKeyhole, Info, ArrowRight
} from 'lucide-react';
import WhatsAppLogin from '../components/WhatsAppLogin';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export default function WhatsAppConnect() {
    const { user, session } = useAuth();
    const { alertDialog, confirmDialog } = useDialog();
    const [accounts, setAccounts] = useState([]);
    const [loadingAccounts, setLoadingAccounts] = useState(true);

    // Recommended (Embedded Signup) state
    const [embedStatus, setEmbedStatus] = useState('idle'); // idle | loading | saving | saved | error
    const [embedError, setEmbedError] = useState(null);
    const [embedConnectedAccount, setEmbedConnectedAccount] = useState(null);

    // Alternative (Manual) state
    const [manualCreds, setManualCreds] = useState({ businessAccountId: '', accessToken: '' });
    const [manualPhoneNumbers, setManualPhoneNumbers] = useState([]);
    const [manualSelectedPhoneId, setManualSelectedPhoneId] = useState('');
    const [manualStatus, setManualStatus] = useState('idle'); // idle | validating | saving | saved | error
    const [manualError, setManualError] = useState(null);
    const [diagnostics, setDiagnostics] = useState({});
    const [diagnosticsLoadingId, setDiagnosticsLoadingId] = useState(null);
    const isSecureForMetaLogin = window.location.protocol === 'https:';

    useEffect(() => {
        if (session?.access_token) fetchAccounts();
    }, [session]);

    useEffect(() => {
        if (!window.FB) return;
        window.FB.init({
            appId: import.meta.env.VITE_META_APP_ID,
            cookie: true, xfbml: true, version: 'v18.0'
        });
    }, []);

    const getAuthHeader = () => {
        const token = session?.access_token;
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    };

    const fetchAccounts = async () => {
        setLoadingAccounts(true);
        try {
            const res = await fetch(`${API_URL}/api/whatsapp/accounts`, {
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
            });
            if (res.status === 401) {
                console.error('Auth failed fetching accounts — session may have expired');
                setAccounts([]);
                return;
            }
            const data = await res.json();
            if (Array.isArray(data)) {
                setAccounts(data);
            } else {
                console.error('Failed to load accounts:', data?.error || data);
                setAccounts([]);
            }
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
            setAccounts([]);
        } finally {
            setLoadingAccounts(false);
        }
    };

    const handleDeleteAccount = async (id) => {
        const confirmed = await confirmDialog('Are you sure you want to disconnect this account?', {
            title: 'Disconnect account',
            tone: 'danger',
            confirmLabel: 'Disconnect',
        });
        if (!confirmed) return;
        try {
            const res = await fetch(`${API_URL}/api/whatsapp/accounts/${id}`, {
                method: 'DELETE',
                headers: { ...getAuthHeader() }
            });
            if (res.ok) setAccounts(prev => prev.filter(a => a.id !== id));
        } catch {
            alertDialog('Failed to delete account', { title: 'Disconnect failed', tone: 'danger' });
        }
    };

    const runAccountDiagnostics = async (id) => {
        setDiagnosticsLoadingId(id);
        try {
            const res = await fetch(`${API_URL}/api/whatsapp/accounts/${id}/diagnostics`, {
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to inspect account');
            setDiagnostics(prev => ({ ...prev, [id]: data }));
        } catch (err) {
            setDiagnostics(prev => ({ ...prev, [id]: { send_ready: false, issues: [err.message] } }));
        } finally {
            setDiagnosticsLoadingId(null);
        }
    };

    // ===== RECOMMENDED: FB Embedded Signup =====
    const handleEmbeddedSignupResponse = async (response) => {
        if (response.authResponse?.code) {
            setEmbedStatus('saving');
            try {
                const res = await fetch(`${API_URL}/api/wa/connect/callback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                    body: JSON.stringify({
                        code: response.authResponse.code,
                        organization_id: user?.user_metadata?.organization_id
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Connection failed');
                const firstAcc = data.accounts?.[0];
                setEmbedConnectedAccount(firstAcc || null);
                setEmbedStatus('saved');
                fetchAccounts();
                setTimeout(() => { setEmbedStatus('idle'); setEmbedConnectedAccount(null); }, 5000);
            } catch (err) {
                setEmbedError(err.message);
                setEmbedStatus('error');
            }
        } else {
            setEmbedStatus('idle');
        }
    };

    const handleEmbeddedSignup = () => {
        if (!isSecureForMetaLogin) {
            setEmbedStatus('error');
            setEmbedError('Meta login requires HTTPS. Open this page from your HTTPS ngrok/public URL before connecting with Meta.');
            return;
        }
        if (!window.FB) {
            alertDialog('Facebook SDK is loading. Try again in a moment.', { title: 'Meta login not ready', tone: 'warning' });
            return;
        }
        setEmbedStatus('loading');
        setEmbedError(null);

        window.FB.login((response) => {
            handleEmbeddedSignupResponse(response);
        }, {
            config_id: import.meta.env.VITE_META_CONFIG_ID,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, featureType: '', sessionInfoVersion: '3' }
        });
    };

    // ===== ALTERNATIVE: Manual Credentials =====
    const handleManualConnect = async (e) => {
        e.preventDefault();
        const businessAccountId = manualCreds.businessAccountId.trim();
        const accessToken = manualCreds.accessToken.trim();

        if (!businessAccountId || !accessToken) {
            setManualError('Please enter both Business Account ID and Access Token.');
            return;
        }

        // Step 1: Fetch phone numbers
        if (manualPhoneNumbers.length === 0) {
            setManualStatus('validating');
            setManualError(null);
            try {
                const res = await fetch(
                    `https://graph.facebook.com/v21.0/${businessAccountId}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`
                );
                const data = await res.json();
                if (data.error) throw new Error(data.error.message);
                if (!data.data?.length) throw new Error('No phone numbers found for this Business Account ID.');
                setManualPhoneNumbers(data.data);
                setManualSelectedPhoneId(data.data[0].id);
                setManualStatus('idle');
            } catch (err) {
                setManualError(err.message);
                setManualStatus('error');
            }
            return;
        }

        // Step 2: Save to backend
        setManualStatus('saving');
        setManualError(null);
        try {
            const selectedPhone = manualPhoneNumbers.find(p => p.id === manualSelectedPhoneId);
            const res = await fetch(`${API_URL}/api/whatsapp/accounts/meta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
                body: JSON.stringify({
                    phone_number_id: manualSelectedPhoneId,
                    waba_id: businessAccountId,
                    access_token: accessToken,
                    display_phone_number: selectedPhone?.display_phone_number || '',
                    name: selectedPhone?.verified_name || 'WhatsApp Business'
                })
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save'); }
            setManualStatus('saved');
            fetchAccounts();
            setTimeout(() => {
                setManualStatus('idle');
                setManualCreds({ businessAccountId: '', accessToken: '' });
                setManualPhoneNumbers([]);
                setManualSelectedPhoneId('');
            }, 4000);
        } catch (err) {
            setManualError(err.message);
            setManualStatus('error');
        }
    };

    const verificationSteps = [
        { icon: Building2, title: 'Business Manager', text: 'Meta Business portfolio chahiye. Legal business name, website, address aur admin access ready rakhein.' },
        { icon: FileCheck2, title: 'Business Verification', text: 'Meta ko business documents submit karne pad sakte hain. Verification ke bina scale aur display-name approval limited ho sakta hai.' },
        { icon: PhoneCall, title: 'Dedicated Number', text: 'Best practice: ek fresh phone number use karein. Jo number personal WhatsApp app me active hai, usko Cloud API me directly use nahi kar sakte.' },
        { icon: LockKeyhole, title: 'Permissions & Webhook', text: 'whatsapp_business_messaging, whatsapp_business_management, access token, phone number ID aur webhook setup required hote hain.' },
    ];

    return (
        <div className="max-w-7xl mx-auto pb-20 space-y-8">
            {/* Page Header */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            WhatsApp connection setup
                        </div>
                        <h1 className="mt-4 text-2xl font-bold text-gray-950">Connect WhatsApp the right way</h1>
                        <p className="mt-2 text-sm leading-6 text-gray-600">
                            WhatsApp automation ke liye do practical routes hain: official Meta Cloud API for full production access, ya QR/session based connection for limited testing and simple flow demos. Neeche dono ka clear difference diya hai.
                        </p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 lg:max-w-md">
                        <div className="flex items-start gap-2">
                            <Info className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>
                                Production clients ke liye official Meta route recommend hai. QR/session method sirf testing, internal demos, ya temporary flow validation ke liye rakhein.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                {verificationSteps.map(step => {
                    const Icon = step.icon;
                    return (
                        <div key={step.title} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-700">
                                <Icon className="h-5 w-5" />
                            </div>
                            <h3 className="text-sm font-bold text-gray-950">{step.title}</h3>
                            <p className="mt-1 text-xs leading-5 text-gray-600">{step.text}</p>
                        </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-green-200 bg-green-50/70 p-5">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold uppercase tracking-wide text-green-900">Official / compliant setup</h2>
                            <p className="mt-1 text-sm leading-6 text-green-900">
                                Full WhatsApp Business access: templates, campaigns, webhooks, reliable delivery, phone-number management, and Meta-compliant automation. Yeh paid/client production ke liye correct route hai.
                            </p>
                        </div>
                    </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white">
                            <QrCode className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-900">QR/session based limited setup</h2>
                            <p className="mt-1 text-sm leading-6 text-gray-600">
                                Personal/device session jaisa behavior: quick flow testing ho sakta hai, lekin templates, official campaigns, stable webhooks, compliance guarantees aur scale available nahi hote.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Connected Accounts */}
            {accounts.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Connected Accounts</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {accounts.map(acc => (
                            <div key={acc.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group hover:border-green-300 transition-all duration-200">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center">
                                            <svg viewBox="0 0 24 24" className="w-5 h-5 text-green-600 fill-current">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.561 4.14 1.539 5.875L0 24l6.29-1.517A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.96 0-3.788-.535-5.35-1.463l-.38-.228-3.933.949.983-3.788-.25-.394A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                                            </svg>
                                        </div>
                                        <div>
                                            <h4 className="font-semibold text-sm text-gray-900">{acc.name || 'WhatsApp Account'}</h4>
                                            <p className="text-xs text-gray-500">{acc.display_phone_number || acc.phone_number_id}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeleteAccount(acc.id)}
                                        className="p-1.5 text-gray-300 hover:text-red-500 rounded-md transition-colors opacity-0 group-hover:opacity-100">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${acc.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${acc.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                                        {acc.status}
                                    </span>
                                    <span className="text-[10px] font-semibold text-gray-400 uppercase">
                                        {acc.whatsapp_business_account_id ? 'Meta API' : 'QR Session'}
                                    </span>
                                </div>
                                {!acc.whatsapp_business_account_id && (
                                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                        <p className="font-bold">QR connected number</p>
                                        <p className="mt-1">Flows will reply from this number when it receives a matching trigger, while the device session remains connected.</p>
                                    </div>
                                )}
                                {acc.whatsapp_business_account_id && (
                                    <div className="mt-3">
                                        <button
                                            type="button"
                                            onClick={() => runAccountDiagnostics(acc.id)}
                                            disabled={diagnosticsLoadingId === acc.id}
                                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                        >
                                            {diagnosticsLoadingId === acc.id ? 'Checking Meta permissions...' : 'Check Send Access'}
                                        </button>
                                        {diagnostics[acc.id] && (
                                            <div className={`mt-2 rounded-lg border p-3 text-xs ${diagnostics[acc.id].send_ready ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                                                <div className="flex items-start gap-2">
                                                    {diagnostics[acc.id].send_ready ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                                                    <div>
                                                        <p className="font-semibold">
                                                            {diagnostics[acc.id].send_ready ? 'Ready to send via Meta API' : 'Meta send access needs attention'}
                                                        </p>
                                                        {!diagnostics[acc.id].send_ready && (
                                                            <ul className="mt-1 list-disc space-y-1 pl-4">
                                                                {(diagnostics[acc.id].issues || ['Unknown Meta permission issue']).map((issue, index) => (
                                                                    <li key={index}>{issue}</li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Connection Methods */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">

                {/* ===== LEFT: RECOMMENDED — Embedded Signup ===== */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="border-b border-green-100 bg-green-50/70 p-6">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-green-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Recommended
                        </div>
                        <h2 className="text-lg font-bold text-gray-950">Official Meta Cloud API</h2>
                        <p className="mt-1 text-xs leading-5 text-gray-600">Best for real businesses, customer support, templates, campaigns and reliable production automation.</p>
                    </div>

                    <div className="p-6 flex flex-col gap-5 flex-1">
                        {/* Success */}
                        {embedStatus === 'saved' && (
                            <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
                                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold text-green-800 text-sm">Connected Successfully!</p>
                                    {embedConnectedAccount && (
                                        <p className="text-xs text-green-700 mt-0.5">
                                            {embedConnectedAccount.display_phone_number || embedConnectedAccount.phone_number_id}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {embedStatus === 'error' && embedError && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="font-semibold text-red-800 text-sm">Connection Failed</p>
                                    <p className="text-xs text-red-700 mt-0.5">{embedError}</p>
                                </div>
                                <button onClick={() => { setEmbedStatus('idle'); setEmbedError(null); }}>
                                    <X className="h-4 w-4 text-red-400 hover:text-red-600" />
                                </button>
                            </div>
                        )}

                        {/* Main CTA Button */}
                        {!isSecureForMetaLogin && (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                                <div className="flex items-start gap-2">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <div>
                                        <p className="font-semibold">Meta login needs HTTPS</p>
                                        <p className="mt-1 text-xs leading-5">Aap abhi HTTP page par ho. Meta FB.login HTTP se block karta hai. Ngrok HTTPS URL ya localhost use karo.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={handleEmbeddedSignup}
                            disabled={embedStatus === 'loading' || embedStatus === 'saving'}
                            className={`w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.98] shadow-md ${
                                embedStatus === 'loading' || embedStatus === 'saving'
                                    ? 'bg-green-400 cursor-not-allowed'
                                    : 'bg-[#25D366] hover:bg-[#20b956] shadow-green-200'
                            }`}
                        >
                            {embedStatus === 'loading' || embedStatus === 'saving' ? (
                                <><Loader2 className="w-4 h-4 animate-spin" />
                                {embedStatus === 'saving' ? 'Saving Account...' : 'Opening WhatsApp Signup...'}</>
                            ) : (
                                <>
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 0C5.373 0 0 5.373 0 12c0 2.136.561 4.14 1.539 5.875L0 24l6.29-1.517A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.96 0-3.788-.535-5.35-1.463l-.38-.228-3.933.949.983-3.788-.25-.394A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                                    </svg>
                                    Connect with Meta
                                </>
                            )}
                        </button>

                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700">Before you start</h3>
                            <ul className="mt-3 space-y-2.5">
                                {[
                                    'Browser pop-up allow rakhein, signup Meta window me open hota hai.',
                                    'Meta Business admin access aur business details ready rakhein.',
                                    'Fresh/dedicated number best hai. Existing WhatsApp number migrate karne se pehle backup aur risk samajh lein.',
                                    'Display name aur business verification Meta approval ke according hoga.',
                                ].map((text, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                                        <span>{text}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg border border-green-100 bg-green-50 p-3 text-green-800">
                                <p className="font-bold">Can do</p>
                                <p className="mt-1 leading-5">Templates, campaigns, webhooks, multi-agent support, flow automation.</p>
                            </div>
                            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-800">
                                <p className="font-bold">Cannot skip</p>
                                <p className="mt-1 leading-5">Meta policies, business verification, opt-in and template approval.</p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700">Recommended setup plan</h3>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['1', 'Prepare business details', 'Business legal name, website, address, GST/company document if Meta asks.'],
                                    ['2', 'Connect with Meta', 'Login with Meta admin, select/create WABA, add a dedicated phone number.'],
                                    ['3', 'Verify send access', 'After connection, use Check Send Access and fix missing permissions if any.'],
                                    ['4', 'Create templates and flows', 'Use Templates for outbound messages and Flow Builder for inbound trigger automation.'],
                                ].map(([step, title, text]) => (
                                    <div key={step} className="flex gap-3">
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">{step}</div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{title}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-gray-500">{text}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
                            <p className="font-bold">After setup</p>
                            <p className="mt-1">Settings me business profile sync/update karein, Broadcasts me approved templates use karein, aur Flow Builder me triggers publish karein.</p>
                        </div>

                    </div>
                </div>

                {/* ===== RIGHT: ALTERNATIVE — Manual Credentials ===== */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="border-b border-blue-100 bg-blue-50/70 p-6">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                            <KeyRound className="h-3.5 w-3.5" />
                            Advanced
                        </div>
                        <h2 className="text-lg font-bold text-gray-950">Manual Meta Token Setup</h2>
                        <p className="mt-1 text-xs leading-5 text-gray-600">Use this when the business already has WABA ID, phone number ID and a valid access token.</p>
                    </div>

                    <div className="p-6 flex flex-col gap-5 flex-1">
                        {/* WhatsApp Icon + Label */}
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[#25D366]">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 0C5.373 0 0 5.373 0 12c0 2.136.561 4.14 1.539 5.875L0 24l6.29-1.517A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.96 0-3.788-.535-5.35-1.463l-.38-.228-3.933.949.983-3.788-.25-.394A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                                </svg>
                            </div>
                            <div>
                                <p className="font-bold text-gray-900 text-sm">Meta API Credentials</p>
                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                                    Official API, manually configured
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                            <p className="font-semibold">Use this only if you know these values:</p>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                                <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" /> WhatsApp Business Account ID</div>
                                <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" /> Permanent or long-lived access token</div>
                                <div className="flex items-center gap-2"><ArrowRight className="h-3.5 w-3.5" /> Phone number already added in Meta</div>
                            </div>
                        </div>

                        {/* Success / Error States */}
                        {manualStatus === 'saved' && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                <p className="text-sm font-semibold text-green-800">Account connected successfully!</p>
                            </div>
                        )}
                        {(manualStatus === 'error') && manualError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-red-700">{manualError}</p>
                                </div>
                                <button onClick={() => { setManualStatus('idle'); setManualError(null); }}>
                                    <X className="h-3.5 w-3.5 text-red-400" />
                                </button>
                            </div>
                        )}

                        {/* Form */}
                        <form onSubmit={handleManualConnect} className="space-y-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Business Account ID + Access Token</p>

                            <input
                                type="text"
                                name="wa_business_account_id_input_disable_autofill"
                                autoComplete="off"
                                placeholder="WhatsApp Business Account ID"
                                value={manualCreds.businessAccountId}
                                onChange={e => setManualCreds(p => ({ ...p, businessAccountId: e.target.value }))}
                                disabled={manualPhoneNumbers.length > 0}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 transition-all"
                            />
                            <input
                                type="text"
                                name="wa_access_token_input_disable_autofill"
                                autoComplete="new-password"
                                placeholder="Access Token"
                                value={manualCreds.accessToken}
                                onChange={e => setManualCreds(p => ({ ...p, accessToken: e.target.value }))}
                                disabled={manualPhoneNumbers.length > 0}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 transition-all"
                            />

                            {/* Phone Number Selector (appears after validation) */}
                            {manualPhoneNumbers.length > 0 && (
                                <div className="animate-in slide-in-from-top-2 duration-300">
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Select Phone Number</p>
                                    <select
                                        value={manualSelectedPhoneId}
                                        onChange={e => setManualSelectedPhoneId(e.target.value)}
                                        className="w-full border border-green-200 bg-green-50 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 transition-all"
                                    >
                                        {manualPhoneNumbers.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.verified_name} ({p.display_phone_number})
                                            </option>
                                        ))}
                                    </select>
                                    <button type="button" onClick={() => { setManualPhoneNumbers([]); setManualSelectedPhoneId(''); }}
                                        className="text-xs text-gray-400 hover:text-gray-600 mt-1">
                                        Change credentials
                                    </button>
                                </div>
                            )}

                            <button type="submit"
                                disabled={manualStatus === 'validating' || manualStatus === 'saving'}
                                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all active:scale-[0.98] ${
                                    manualStatus === 'validating' || manualStatus === 'saving'
                                        ? 'bg-green-400 cursor-not-allowed'
                                        : 'bg-[#25D366] hover:bg-[#20b956]'
                                } shadow-md shadow-green-100`}>
                                {manualStatus === 'validating' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Validating...</> :
                                 manualStatus === 'saving' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...</> :
                                 manualPhoneNumbers.length > 0 ? 'Link to Platform' : 'Validate Access'}
                            </button>
                        </form>

                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-700">Manual setup checklist</h3>
                            <div className="mt-4 space-y-3">
                                {[
                                    ['1', 'Create or select Meta app', 'App must have WhatsApp product and required permissions enabled.'],
                                    ['2', 'Generate access token', 'Use a system user/permanent token for production, not a short test token.'],
                                    ['3', 'Paste WABA ID and token', 'Validate Access will fetch available phone numbers from that WABA.'],
                                    ['4', 'Select phone number', 'Choose the verified phone number and save it to this platform.'],
                                    ['5', 'Run diagnostics', 'Connected Accounts card me Check Send Access click karke token + phone mapping verify karein.'],
                                ].map(([step, title, text]) => (
                                    <div key={step} className="flex gap-3">
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{step}</div>
                                        <div>
                                            <p className="text-sm font-semibold text-gray-900">{title}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-gray-500">{text}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
                            <p className="font-bold">Common mistakes</p>
                            <p className="mt-1">Wrong WABA ID, expired token, token without messaging permission, or phone number belonging to another WABA will stop sending.</p>
                        </div>
                    </div>
                </div>

                {/* ===== QR / SESSION BASED LIMITED CONNECT ===== */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="border-b border-gray-100 bg-gray-50 p-6">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                            <QrCode className="h-3.5 w-3.5" />
                            Limited testing
                        </div>
                        <h2 className="text-lg font-bold text-gray-950">QR Session Connection</h2>
                        <p className="mt-1 text-xs leading-5 text-gray-600">Quickly connect a WhatsApp device session to test chats and flows. Not recommended for client production.</p>
                    </div>

                    <div className="flex flex-1 flex-col gap-5 p-6">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            <p className="font-bold">What this is good for</p>
                            <ul className="mt-2 space-y-1.5 text-xs leading-5">
                                <li>Flow builder testing with your own account.</li>
                                <li>Internal demos before Meta verification is complete.</li>
                                <li>Small manual-style chat use where official templates are not needed.</li>
                            </ul>
                        </div>

                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                            <p className="font-bold">Important limitations</p>
                            <ul className="mt-2 space-y-1.5 text-xs leading-5">
                                <li>No official template/campaign access.</li>
                                <li>Session can disconnect when phone/network changes.</li>
                                <li>Higher operational risk and not a compliance-grade integration.</li>
                                <li>Use only with accounts you own and have permission to connect.</li>
                            </ul>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                            <p className="font-bold text-gray-950">How flows work with QR access</p>
                            <ul className="mt-2 space-y-1.5 text-xs leading-5">
                                <li>Flow triggers apply to this connected QR number when a customer messages this number.</li>
                                <li>It can send text replies, buttons/lists where supported, media links/files, AI replies, and handoff-style flow steps.</li>
                                <li>It cannot create approved Meta templates, run broadcast campaigns through Cloud API, edit Meta business profile, or guarantee production-grade delivery.</li>
                                <li>If multiple numbers are connected, active flows are currently shared across the organization, not saved per-number.</li>
                            </ul>
                        </div>

                        <WhatsAppLogin onAccountConnected={fetchAccounts} />
                    </div>
                </div>
            </div>
        </div>
    );
}
