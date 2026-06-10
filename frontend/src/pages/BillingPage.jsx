import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, CreditCard, Loader2, Megaphone, ReceiptText, ShieldCheck, Wallet } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import {
    BILLING_INTERVALS,
    FALLBACK_PLANS,
    FALLBACK_RATE_CARDS,
    formatINRFromPaise,
    getMonthlyEquivalent,
    getPlanPrice,
} from '../config/whatsappPricing'

const API_BASE = `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/api`

function normalizePlanFeatures(plan) {
    if (Array.isArray(plan?.features)) return plan.features
    return FALLBACK_PLANS.find(item => item.id === plan?.id)?.features || []
}

function getPlanBadge(planId) {
    if (planId === 'growth') return 'Recommended'
    if (planId === 'pro') return 'Scale'
    return null
}

function isCurrentPlan(currentPlan, plan) {
    return currentPlan?.id === plan?.id || currentPlan?.name === plan?.name
}

async function getFunctionErrorMessage(error, fallback) {
    try {
        if (error?.context?.json) {
            const body = await error.context.json()
            return body?.error || body?.message || error.message || fallback
        }
    } catch {
        // Fall through to generic message.
    }
    return error?.message || fallback
}

export default function BillingPage() {
    const { user, refreshProfile, apiCall } = useAuth()
    const [interval, setInterval] = useState(1)
    const [overview, setOverview] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [upgrading, setUpgrading] = useState(null)
    const [recharging, setRecharging] = useState(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        apiCall(`${API_BASE}/billing/overview`)
            .then(async res => {
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data?.error || 'Failed to load billing')
                if (!cancelled) setOverview(data)
            })
            .catch(err => {
                if (!cancelled) setError(err.message || 'Failed to load billing')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const plans = overview?.plans?.length ? overview.plans : FALLBACK_PLANS
    const rateCards = overview?.rate_cards?.length ? overview.rate_cards : FALLBACK_RATE_CARDS
    const categorySpend = overview?.spend?.categories || []
    const currentPlan = overview?.current_plan || plans.find(plan => plan.id === 'free')
    const wallet = overview?.wallet || { balance_paise: 0, currency: 'INR', low_balance_threshold_paise: 10000 }

    const rateMap = useMemo(() => {
        return rateCards.reduce((acc, rate) => {
            acc[rate.category] = rate
            return acc
        }, {})
    }, [rateCards])

    const handleUpgrade = async (plan) => {
        if (!plan?.id || plan.id === 'free' || plan.id === 'enterprise' || isCurrentPlan(currentPlan, plan)) return

        try {
            setUpgrading(plan.id)
            const { data, error: fnError } = await supabase.functions.invoke('create-whatsapp-payment-link', {
                body: {
                    planId: plan.id,
                    interval,
                    userId: user?.id,
                    customerName: user?.user_metadata?.full_name || user?.email?.split('@')[0],
                    customerEmail: user?.email,
                },
            })

            if (fnError) throw new Error(await getFunctionErrorMessage(fnError, 'Failed to create payment link'))
            if (data?.success && data?.payment_link) {
                window.location.href = data.payment_link
                return
            }
            throw new Error(data?.error || 'Failed to create payment link')
        } catch (err) {
            console.error('Upgrade error:', err)
            alert(err.message || 'Something went wrong. Please try again.')
        } finally {
            setUpgrading(null)
            refreshProfile?.()
        }
    }

    const handleWalletRecharge = async (amountPaise) => {
        const organizationId = overview?.organization?.id || wallet?.organization_id
        if (!organizationId) {
            alert('Organization not found. Please refresh and try again.')
            return
        }

        try {
            setRecharging(amountPaise)
            const { data, error: fnError } = await supabase.functions.invoke('create-whatsapp-wallet-recharge-link', {
                body: {
                    organizationId,
                    userId: user?.id,
                    amountPaise,
                    customerName: user?.user_metadata?.full_name || user?.email?.split('@')[0],
                    customerEmail: user?.email,
                },
            })

            if (fnError) throw new Error(await getFunctionErrorMessage(fnError, 'Failed to create recharge link'))
            if (data?.success && data?.payment_link) {
                window.location.href = data.payment_link
                return
            }
            throw new Error(data?.error || 'Failed to create recharge link')
        } catch (err) {
            console.error('Wallet recharge error:', err)
            alert(err.message || 'Could not start wallet recharge.')
        } finally {
            setRecharging(null)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 p-6">
                <div className="mx-auto flex min-h-[420px] max-w-6xl items-center justify-center rounded-2xl border border-gray-200 bg-white">
                    <Loader2 className="mr-3 h-5 w-5 animate-spin text-gray-500" />
                    <span className="text-sm font-medium text-gray-600">Loading billing workspace...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-950">Billing & Usage</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Platform subscription alag hai. Marketing, utility aur authentication message spend wallet se deduct hoga.
                        </p>
                    </div>
                    <div className="inline-flex w-fit rounded-xl border border-gray-200 bg-white p-1">
                        {BILLING_INTERVALS.map(item => (
                            <button
                                key={item.months}
                                type="button"
                                onClick={() => setInterval(item.months)}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                    interval === item.months ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100'
                                }`}
                            >
                                {item.label}
                                {item.discount > 0 && <span className="ml-2 text-xs text-green-500">-{item.discount}%</span>}
                            </button>
                        ))}
                    </div>
                </header>

                {error && (
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-500">Current Plan</p>
                            <ShieldCheck className="h-5 w-5 text-green-600" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-gray-950">{currentPlan?.name || user?.plan || 'Free'}</p>
                        <p className="mt-1 text-xs text-gray-500">{overview?.organization?.plan_status || user?.subscription_status || 'active'}</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-500">Wallet Balance</p>
                            <Wallet className="h-5 w-5 text-emerald-600" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-gray-950">{formatINRFromPaise(wallet.balance_paise)}</p>
                        <p className="mt-1 text-xs text-gray-500">Low balance alert below {formatINRFromPaise(wallet.low_balance_threshold_paise)}</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-500">This Month Spend</p>
                            <ReceiptText className="h-5 w-5 text-blue-600" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-gray-950">{formatINRFromPaise(overview?.spend?.month_spend_paise)}</p>
                        <p className="mt-1 text-xs text-gray-500">Paid WhatsApp template/message usage</p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-500">Today Spend</p>
                            <Megaphone className="h-5 w-5 text-purple-600" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-gray-950">{formatINRFromPaise(overview?.spend?.today_spend_paise)}</p>
                        <p className="mt-1 text-xs text-gray-500">Live campaign and automation cost</p>
                    </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">Recharge Message Wallet</h2>
                            <p className="mt-1 text-sm text-gray-500">
                                Marketing, utility aur authentication message charges wallet se deduct honge. Campaign launch se pehle enough balance rakho.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                            {[50000, 100000, 250000, 500000].map(amount => (
                                <button
                                    key={amount}
                                    type="button"
                                    onClick={() => handleWalletRecharge(amount)}
                                    disabled={recharging !== null}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {recharging === amount && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {formatINRFromPaise(amount)}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
                    <div className="rounded-xl border border-gray-200 bg-white">
                        <div className="border-b border-gray-100 p-5">
                            <h2 className="text-base font-semibold text-gray-950">Message Spend Breakdown</h2>
                            <p className="mt-1 text-sm text-gray-500">User ko yahan clear dikh jayega ki marketing aur utility par kitna spend hua.</p>
                        </div>
                        <div className="grid grid-cols-1 divide-y divide-gray-100 md:grid-cols-4 md:divide-x md:divide-y-0">
                            {['marketing', 'utility', 'authentication', 'service'].map(category => {
                                const spend = categorySpend.find(item => item.category === category) || {}
                                const rate = rateMap[category] || FALLBACK_RATE_CARDS.find(item => item.category === category)
                                return (
                                    <div key={category} className="p-5">
                                        <p className="text-sm font-semibold text-gray-950">{rate?.label || category}</p>
                                        <p className="mt-2 text-2xl font-semibold text-gray-950">{formatINRFromPaise(spend.charged_amount_paise)}</p>
                                        <p className="mt-1 text-xs text-gray-500">{spend.message_count || 0} messages</p>
                                        <p className="mt-4 text-xs font-medium text-gray-500">Rate: {formatINRFromPaise(rate?.rate_paise)}/message</p>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white">
                        <div className="border-b border-gray-100 p-5">
                            <h2 className="text-base font-semibold text-gray-950">Message Rate Card</h2>
                            <p className="mt-1 text-sm text-gray-500">Rates admin side se update honge jab Meta pricing change kare.</p>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {rateCards.map(rate => (
                                <div key={rate.category} className="flex items-start justify-between gap-4 p-4">
                                    <div>
                                        <p className="text-sm font-semibold capitalize text-gray-900">{rate.label || rate.category}</p>
                                        <p className="mt-1 text-xs leading-5 text-gray-500">{rate.description || rate.notes}</p>
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold text-gray-950">{formatINRFromPaise(rate.rate_paise)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">Subscription Plans</h2>
                            <p className="mt-1 text-sm text-gray-500">Plan access ke liye hai. WhatsApp message spend wallet/recharge se alag chalega.</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <CreditCard className="h-4 w-4" />
                            Razorpay secure checkout
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                        {plans.filter(plan => plan.id !== 'enterprise').map(plan => {
                            const price = getPlanPrice(plan, interval)
                            const monthlyEquivalent = getMonthlyEquivalent(plan, interval)
                            const current = isCurrentPlan(currentPlan, plan)
                            const badge = plan.badge || getPlanBadge(plan.id)
                            return (
                                <article
                                    key={plan.id}
                                    className={`relative rounded-xl border p-5 ${
                                        plan.id === 'growth' ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-950'
                                    }`}
                                >
                                    {badge && !current && (
                                        <span className="absolute right-4 top-4 rounded-full bg-green-500 px-2.5 py-1 text-xs font-bold text-white">
                                            {badge}
                                        </span>
                                    )}
                                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                                    <p className={`mt-2 min-h-12 text-sm ${plan.id === 'growth' ? 'text-gray-300' : 'text-gray-500'}`}>{plan.description}</p>
                                    <div className="mt-5">
                                        <p className="text-3xl font-bold">{formatINRFromPaise(monthlyEquivalent)}</p>
                                        <p className={`mt-1 text-xs ${plan.id === 'growth' ? 'text-gray-300' : 'text-gray-500'}`}>
                                            {price === 0 ? 'Forever' : interval === 12 ? `${formatINRFromPaise(price)} billed yearly` : 'per month'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={current || upgrading === plan.id || plan.id === 'free'}
                                        onClick={() => handleUpgrade(plan)}
                                        className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-60 ${
                                            plan.id === 'growth'
                                                ? 'bg-white text-gray-950 hover:bg-gray-100'
                                                : 'bg-gray-950 text-white hover:bg-gray-800'
                                        }`}
                                    >
                                        {upgrading === plan.id ? 'Processing...' : current ? 'Current Plan' : plan.id === 'free' ? 'Free Plan' : `Upgrade to ${plan.name}`}
                                    </button>
                                    <ul className="mt-5 space-y-3">
                                        {normalizePlanFeatures(plan).slice(0, 7).map(feature => (
                                            <li key={feature} className="flex gap-2 text-sm">
                                                <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.id === 'growth' ? 'text-green-400' : 'text-green-600'}`} />
                                                <span className={plan.id === 'growth' ? 'text-gray-200' : 'text-gray-600'}>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </article>
                            )
                        })}
                    </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 p-5">
                        <h2 className="text-base font-semibold text-gray-950">Recent Wallet Transactions</h2>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {(overview?.recent_transactions || []).length === 0 ? (
                            <p className="p-5 text-sm text-gray-500">Abhi wallet transaction history empty hai.</p>
                        ) : overview.recent_transactions.map(tx => {
                            const isPending = tx.status === 'pending';
                            const isCompleted = tx.status === 'completed';
                            return (
                                <div key={tx.id} className="flex items-center justify-between gap-4 p-4">
                                    <div>
                                        <p className="text-sm font-semibold capitalize text-gray-900">{String(tx.type || '').replaceAll('_', ' ')}</p>
                                        <div className="mt-1 flex items-center gap-2">
                                            {isPending ? (
                                                <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                                                    Incomplete / Cancelled
                                                </span>
                                            ) : isCompleted ? (
                                                <span className="inline-flex rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                                                    Completed
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-500">{tx.description || tx.status}</span>
                                            )}
                                            {isCompleted && (
                                                <button
                                                    onClick={() => {
                                                        const invoiceDate = new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
                                                        const invoiceNo = `GAP-${new Date(tx.created_at).getFullYear()}-${tx.id.split('-')[0].toUpperCase()}`;
                                                        const customerName = user?.user_metadata?.organization_name || user?.user_metadata?.full_name || 'Customer';
                                                        const amountFormatted = formatINRFromPaise(Math.abs(tx.amount_paise));
                                                        
                                                        const receiptContent = `
                                                            <html>
                                                            <head>
                                                            <title>Invoice - ${invoiceNo}</title>
                                                            <style>
                                                            body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; margin: 0; color: #111827; background: #fff; }
                                                            .invoice-container { max-width: 800px; margin: 0 auto; }
                                                            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
                                                            .logo-container { display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
                                                            .logo-icon { width: 32px; height: 32px; object-fit: contain; }
                                                            .invoice-title { font-size: 28px; font-weight: 500; letter-spacing: 2px; color: #374151; }
                                                            .company-details { margin-top: 10px; font-size: 14px; color: #4b5563; line-height: 1.5; }
                                                            .billing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
                                                            .bill-to h3 { font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: 1px; margin-bottom: 8px; text-transform: uppercase; }
                                                            .bill-to p { font-size: 14px; margin: 0; line-height: 1.5; color: #4b5563; }
                                                            .bill-to strong { color: #111827; font-size: 16px; display: block; margin-bottom: 4px; }
                                                            .meta-table { width: 100%; border-collapse: collapse; }
                                                            .meta-table td { padding: 6px 0; font-size: 14px; }
                                                            .meta-table td:first-child { font-weight: 600; color: #374151; width: 40%; }
                                                            .meta-table td:last-child { text-align: right; color: #111827; }
                                                            .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
                                                            .invoice-table th { padding: 12px 0; border-bottom: 2px solid #e5e7eb; font-size: 11px; font-weight: 600; color: #111827; text-transform: uppercase; letter-spacing: 1px; text-align: right; }
                                                            .invoice-table th:first-child { text-align: left; }
                                                            .invoice-table td { padding: 16px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; text-align: right; color: #374151; }
                                                            .invoice-table td:first-child { text-align: left; font-weight: 600; color: #111827; }
                                                            .invoice-table .desc-sub { display: block; font-weight: normal; color: #6b7280; font-size: 12px; margin-top: 4px; }
                                                            .summary-container { display: flex; justify-content: flex-end; }
                                                            .summary-table { width: 300px; border-collapse: collapse; }
                                                            .summary-table td { padding: 8px 0; font-size: 14px; text-align: right; }
                                                            .summary-table td:first-child { text-align: left; color: #4b5563; }
                                                            .summary-table .total-row td { padding-top: 12px; border-top: 2px solid #111827; font-weight: 700; font-size: 16px; color: #111827; }
                                                            .memo { margin-top: 60px; font-size: 13px; color: #4b5563; line-height: 1.6; }
                                                            .memo strong { color: #111827; display: block; margin-bottom: 4px; font-size: 14px; }
                                                            </style>
                                                            </head>
                                                            <body>
                                                                <div class="invoice-container">
                                                                    <div class="header">
                                                                        <div>
                                                                            <div class="logo-container">
                                                                                <img src="https://getaipilot.in/logo.png" alt="Get AI Pilot Logo" class="logo-icon" />
                                                                                <span>Get AI Pilot</span>
                                                                            </div>
                                                                            <div class="company-details">
                                                                                Get AI Pilot Automation<br>
                                                                                India<br>
                                                                                support@getaipilot.in
                                                                            </div>
                                                                        </div>
                                                                        <div class="invoice-title">INVOICE</div>
                                                                    </div>
                                                            
                                                                    <div class="billing-grid">
                                                                        <div class="bill-to">
                                                                            <h3>Bill To</h3>
                                                                            <strong>${customerName}</strong>
                                                                            <p>${user?.email || ''}</p>
                                                                            <p>India</p>
                                                                        </div>
                                                                        <div>
                                                                            <table class="meta-table">
                                                                                <tr><td>Invoice number</td><td>${invoiceNo}</td></tr>
                                                                                <tr><td>Invoice date</td><td>${invoiceDate}</td></tr>
                                                                                <tr><td>Amount due</td><td>${amountFormatted}</td></tr>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                            
                                                                    <table class="invoice-table">
                                                                        <thead>
                                                                            <tr>
                                                                                <th>Description</th>
                                                                                <th>Quantity</th>
                                                                                <th>Rate</th>
                                                                                <th>Amount</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            <tr>
                                                                                <td>
                                                                                    WhatsApp Message Wallet Recharge
                                                                                    <span class="desc-sub">Transaction ID: ${tx.id}</span>
                                                                                </td>
                                                                                <td>1</td>
                                                                                <td>${amountFormatted}</td>
                                                                                <td>${amountFormatted}</td>
                                                                            </tr>
                                                                        </tbody>
                                                                    </table>
                                                            
                                                                    <div class="summary-container">
                                                                        <table class="summary-table">
                                                                            <tr><td>Subtotal</td><td>${amountFormatted}</td></tr>
                                                                            <tr><td>Tax</td><td>₹0.00</td></tr>
                                                                            <tr class="total-row"><td>Amount due</td><td>${amountFormatted}</td></tr>
                                                                        </table>
                                                                    </div>
                                                            
                                                                    <div class="memo">
                                                                        <strong>Memo:</strong>
                                                                        Thank you for choosing Get AI Pilot.<br>
                                                                        This invoice is generated for your wallet recharge and account services.<br>
                                                                        Taxes, if applicable, are calculated from the saved billing profile and local regulations.<br>
                                                                        For billing support, contact support@getaipilot.in.
                                                                    </div>
                                                                </div>
                                                                <script>setTimeout(() => window.print(), 500);</script>
                                                            </body>
                                                            </html>
                                                        `;
                                                        const printWin = window.open('', '_blank');
                                                        printWin.document.write(receiptContent);
                                                        printWin.document.close();
                                                    }}
                                                    className="ml-2 text-xs font-semibold text-indigo-600 hover:text-indigo-500 hover:underline"
                                                >
                                                    Download Receipt
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-semibold ${tx.amount_paise < 0 ? 'text-red-600' : 'text-gray-950'} ${isPending ? 'line-through text-gray-400 opacity-60' : ''}`}>
                                            {formatINRFromPaise(Math.abs(tx.amount_paise))}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">{new Date(tx.created_at).toLocaleDateString('en-IN')}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    )
}
