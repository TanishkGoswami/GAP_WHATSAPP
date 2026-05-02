import { useState, useEffect } from 'react';
import { Trash2, Smartphone, CheckCircle2, AlertCircle, Loader2, X, Copy, ExternalLink, Link as LinkIcon } from 'lucide-react';
import WhatsAppLogin from '../components/WhatsAppLogin';
import { useAuth } from '../context/AuthContext';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export default function WhatsAppConnect() {
    const { user, session } = useAuth();
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
        if (!confirm('Are you sure you want to disconnect this account?')) return;
        try {
            const res = await fetch(`${API_URL}/api/whatsapp/accounts/${id}`, {
                method: 'DELETE',
                headers: { ...getAuthHeader() }
            });
            if (res.ok) setAccounts(prev => prev.filter(a => a.id !== id));
        } catch { alert('Failed to delete account'); }
    };

    // ===== RECOMMENDED: FB Embedded Signup =====
    const handleEmbeddedSignup = () => {
        if (!window.FB) { alert('Facebook SDK is loading. Try again in a moment.'); return; }
        setEmbedStatus('loading');
        setEmbedError(null);

        window.FB.login(async (response) => {
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

    return (
        <div className="max-w-6xl mx-auto pb-20 space-y-8">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Connect WhatsApp</h1>
                <p className="text-sm text-gray-500 mt-1">Link your WhatsApp Business account to start sending and receiving messages</p>
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
                                        {acc.whatsapp_business_account_id ? 'Meta API' : 'Baileys'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Two-Column Onboarding Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* ===== LEFT: RECOMMENDED — Embedded Signup ===== */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 pb-4 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-gray-900 text-center">Connect WhatsApp Business</h2>
                        <p className="text-xs text-gray-400 text-center mt-1">Recommended — One Click Business Integration</p>
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
                                    Connect WhatsApp <span className="text-[10px] ml-1 bg-white/20 px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold">Under Development</span>
                                </>
                            )}
                        </button>

                        {/* Instructions */}
                        <ul className="space-y-2.5">
                            {[
                                { dot: 'bg-amber-400', text: <>The seamless integration will open <span className="text-blue-600 font-medium">in a pop-up</span>. Make sure your browser is not blocking pop-ups.</> },
                                { dot: 'bg-amber-400', text: <>You will be asked to provide a phone number for WhatsApp Business integration. We strongly recommend using a <span className="font-medium">new phone number</span>.</> },
                                { dot: 'bg-amber-400', text: 'However, if you already have a WhatsApp account associated with that number, back up your WhatsApp data and then delete that account.' },
                            ].map((item, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-600">
                                    <span className={`w-2 h-2 rounded-full ${item.dot} mt-1.5 shrink-0`}></span>
                                    <span>{item.text}</span>
                                </li>
                            ))}
                        </ul>

                    </div>
                </div>

                {/* ===== RIGHT: ALTERNATIVE — Manual Credentials ===== */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 pb-4 border-b border-gray-100">
                        <h2 className="text-lg font-bold text-gray-900 text-center">Connect WhatsApp Business</h2>
                        <p className="text-xs text-gray-400 text-center mt-1">Alternative — Connect your WhatsApp account</p>
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
                                <p className="font-bold text-gray-900 text-sm">WhatsApp</p>
                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                                    Alternative account connection
                                </p>
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
                                placeholder="WhatsApp Business Account ID"
                                value={manualCreds.businessAccountId}
                                onChange={e => setManualCreds(p => ({ ...p, businessAccountId: e.target.value }))}
                                disabled={manualPhoneNumbers.length > 0}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 transition-all"
                            />
                            <input
                                type="password"
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
                                        ← Change credentials
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
                                 manualPhoneNumbers.length > 0 ? '🔗 Link to Platform' : '⟶ Connect'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
