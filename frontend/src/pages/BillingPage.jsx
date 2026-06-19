import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronDown, CreditCard, Hexagon, Loader2, Megaphone, ReceiptText, ShieldCheck, Wallet, Plus, ArrowRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'
import TourButton from '../onboarding/TourButton'
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

function isPaidSubscriptionPlan(plan) {
    const id = String(plan?.id || '').toLowerCase()
    const name = String(plan?.name || '').toLowerCase()
    return id !== 'enterprise'
        && id !== 'free'
        && !name.includes('free')
        && Number(plan?.monthly_price_paise || 0) > 0
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
    const [overview, setOverview] = useState(() => {
        try {
            const cached = localStorage.getItem(`gap_billing_overview_${user?.id || 'default'}`)
            return cached ? JSON.parse(cached) : null
        } catch {
            return null
        }
    })
    const [loading, setLoading] = useState(() => {
        try {
            const cached = localStorage.getItem(`gap_billing_overview_${user?.id || 'default'}`)
            return !cached
        } catch {
            return true
        }
    })
    const [error, setError] = useState('')
    const [upgrading, setUpgrading] = useState(null)
    const [recharging, setRecharging] = useState(null)
    const [isMessageBillingOpen, setIsMessageBillingOpen] = useState(false)
    const [isCustomMode, setIsCustomMode] = useState(false)
    const [customAmount, setCustomAmount] = useState('')

    useEffect(() => {
        let cancelled = false
        if (!overview) {
            setLoading(true)
        }
        apiCall(`${API_BASE}/billing/overview`)
            .then(async res => {
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data?.error || 'Failed to load billing')
                if (!cancelled) {
                    setOverview(data)
                    try {
                        localStorage.setItem(`gap_billing_overview_${user?.id || 'default'}`, JSON.stringify(data))
                    } catch (e) {
                        console.warn('Failed to cache billing:', e)
                    }
                }
            })
            .catch(err => {
                if (!cancelled) setError(err.message || 'Failed to load billing')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id])

    const plans = (overview?.plans?.length ? overview.plans : FALLBACK_PLANS).filter(isPaidSubscriptionPlan)
    const rateCards = overview?.rate_cards?.length ? overview.rate_cards : FALLBACK_RATE_CARDS
    const categorySpend = overview?.spend?.categories || []
    const currentPlan = overview?.current_plan || null
    const wallet = overview?.wallet || { balance_paise: 0, currency: 'INR', low_balance_threshold_paise: 10000 }
    const walletTransactions = (overview?.recent_wallet_transactions || overview?.recent_transactions || [])
        .filter(tx => !['message_debit', 'failed_debit'].includes(String(tx.type || '')))
    const messageChargeRows = overview?.recent_message_charges?.length
        ? overview.recent_message_charges
        : (overview?.recent_transactions || []).filter(tx => ['message_debit', 'failed_debit'].includes(String(tx.type || '')))
    const messageCharges = messageChargeRows
        .filter(tx => ['message_debit', 'failed_debit'].includes(String(tx.type || '')))
        .map(tx => ({
            id: tx.id,
            source: tx.reference_type || 'message',
            category: tx.metadata?.category,
            template_name: tx.metadata?.template_name,
            campaign_id: tx.metadata?.campaign_id || tx.reference_id,
            charged_amount_paise: Math.abs(Number(tx.amount_paise || 0)),
            billing_status: tx.status === 'completed' ? 'charged' : tx.status,
            created_at: tx.created_at,
        }))
        .concat(messageChargeRows
            .filter(tx => !['message_debit', 'failed_debit'].includes(String(tx.type || '')))
            .map(tx => ({
                ...tx,
                charged_amount_paise: Math.abs(Number(tx.charged_amount_paise || 0)),
            })))
    const messageChargesTotalPaise = messageCharges.reduce((sum, charge) => sum + Number(charge.charged_amount_paise || 0), 0)

    const rateMap = useMemo(() => {
        return rateCards.reduce((acc, rate) => {
            acc[rate.category] = rate
            return acc
        }, {})
    }, [rateCards])

    const handleUpgrade = async (plan) => {
        if (!plan?.id || plan.id === 'enterprise' || isCurrentPlan(currentPlan, plan)) return

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

    const handleCustomSubmit = async () => {
        const amt = parseFloat(customAmount)
        if (isNaN(amt) || amt <= 0) {
            alert('Please enter a valid amount.')
            return
        }
        if (amt < 100) {
            alert('Minimum recharge amount is ₹100.')
            return
        }
        const amountPaise = Math.round(amt * 100)
        await handleWalletRecharge(amountPaise)
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
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-950">Billing & Usage</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Platform subscription alag hai. Marketing, utility aur authentication message spend wallet se deduct hoga.
                        </p>
                    </div>
                    <TourButton />
                </header>

                {error && (
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div data-tour="billing-wallet" className="rounded-xl border border-gray-200 bg-white p-5">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-gray-500">Current Plan</p>
                            <ShieldCheck className="h-5 w-5 text-green-600" />
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-gray-950">{currentPlan?.name || user?.plan || 'No active plan'}</p>
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

                <section data-tour="billing-recharge" className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 text-white shadow-xl shadow-indigo-950/20">
                    {/* Glowing decorative shapes */}
                    <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
                    <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

                    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between w-full">
                        <div className="flex items-center gap-5">
                            {/* Money asset illustration */}
                            <div className="relative hidden shrink-0 sm:block">
                                <div className="absolute -inset-2 rounded-full bg-indigo-500/20 blur-md" />
                                <img
                                    src="/images/money.png"
                                    alt="Money wallet illustration"
                                    className="relative h-20 w-20 object-contain drop-shadow-[0_8px_16px_rgba(99,102,241,0.4)] transition-transform duration-300 hover:scale-110"
                                />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <span className="sm:hidden shrink-0">
                                        <img src="/images/money.png" alt="Money" className="h-8 w-8 object-contain" />
                                    </span>
                                    Recharge Message Wallet
                                </h2>
                                <p className="mt-1.5 text-sm text-indigo-200/80 leading-relaxed max-w-xl">
                                    Marketing, utility aur authentication message charges wallet se deduct honge. Campaign launch se pehle enough balance rakho.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap items-center">
                            {[50000, 100000, 250000, 500000].map(amount => (
                                <button
                                    key={amount}
                                    type="button"
                                    onClick={() => handleWalletRecharge(amount)}
                                    disabled={recharging !== null}
                                    className="group relative inline-flex min-w-[100px] sm:min-w-[120px] items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 hover:scale-[1.03] hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:shadow-lg hover:shadow-indigo-500/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {recharging === amount ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                                    ) : (
                                        <Wallet className="h-4 w-4 text-indigo-400 transition-transform group-hover:scale-110" />
                                    )}
                                    <span>{formatINRFromPaise(amount)}</span>

                                    {/* Subtle glow effect behind button */}
                                    <div className="absolute -inset-px -z-10 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                </button>
                            ))}

                            {isCustomMode ? (
                                <div className="relative inline-flex min-w-[150px] sm:min-w-[180px] items-center gap-2 overflow-hidden rounded-xl border border-indigo-400/40 bg-white/10 pl-3 pr-2 py-2 text-sm font-semibold text-white backdrop-blur-md shadow-lg shadow-indigo-500/10 transition-all duration-300">
                                    <span className="text-indigo-400 font-bold select-none">₹</span>
                                    <input
                                        type="number"
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        placeholder="Amount"
                                        min="100"
                                        className="w-16 sm:w-20 bg-transparent border-0 outline-none p-0 text-sm font-bold text-white placeholder-white/30 focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleCustomSubmit()
                                            } else if (e.key === 'Escape') {
                                                setIsCustomMode(false)
                                                setCustomAmount('')
                                            }
                                        }}
                                    />
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={handleCustomSubmit}
                                            disabled={recharging !== null || !customAmount}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white transition-all hover:bg-indigo-500 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                            title="Proceed to pay"
                                        >
                                            {recharging !== null ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                                            ) : (
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsCustomMode(false)
                                                setCustomAmount('')
                                            }}
                                            disabled={recharging !== null}
                                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-all hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                            title="Cancel"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setIsCustomMode(true)}
                                    disabled={recharging !== null}
                                    className="group relative inline-flex min-w-[100px] sm:min-w-[120px] items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white/85 backdrop-blur-md transition-all duration-300 hover:scale-[1.03] hover:border-solid hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white hover:shadow-lg hover:shadow-indigo-500/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Plus className="h-4 w-4 text-indigo-400 transition-transform group-hover:scale-110" />
                                    <span>Custom</span>

                                    {/* Subtle glow effect behind button */}
                                    <div className="absolute -inset-px -z-10 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                                </button>
                            )}
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

                <section data-tour="billing-activity" className="rounded-xl border border-gray-200 bg-white">
                    <button
                        type="button"
                        onClick={() => setIsMessageBillingOpen(prev => !prev)}
                        className="flex w-full flex-col gap-3 p-5 text-left transition-colors hover:bg-gray-50 sm:flex-row sm:items-start sm:justify-between"
                        aria-expanded={isMessageBillingOpen}
                    >
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-gray-950">Message Billing Activity</h2>
                                <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                    Latest {messageCharges.length} records
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-500">
                                Broadcast/template usage charges ka compact preview. Full campaign history Broadcasts page me milegi.
                            </p>
                        </div>
                        <span className="inline-flex w-fit items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">
                            <Megaphone className="h-3.5 w-3.5 text-blue-600" />
                            {formatINRFromPaise(messageChargesTotalPaise)}
                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isMessageBillingOpen ? 'rotate-180' : ''}`} />
                        </span>
                    </button>
                    {isMessageBillingOpen ? (
                        <div className="divide-y divide-gray-100 border-t border-gray-100">
                            {messageCharges.length === 0 ? (
                                <p className="p-5 text-sm text-gray-500">Abhi message billing activity empty hai. Broadcast ya paid template send hone ke baad charges yahan aayenge.</p>
                            ) : messageCharges.map(charge => (
                                <div key={charge.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-gray-900">{getMessageChargeTitle(charge)}</p>
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${charge.billing_status === 'charged' ? 'bg-green-50 text-green-700 ring-green-600/20' : charge.billing_status === 'failed' ? 'bg-red-50 text-red-700 ring-red-600/10' : 'bg-gray-50 text-gray-600 ring-gray-200'}`}>
                                                {String(charge.billing_status || 'recorded').replaceAll('_', ' ')}
                                            </span>
                                        </div>
                                        <p className="mt-1 truncate text-xs text-gray-500">
                                            {charge.template_name ? `Template: ${charge.template_name}` : 'No template name'}{charge.campaign_id ? ` - Campaign ${String(charge.campaign_id).slice(0, 8)}` : ''}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-left sm:text-right">
                                        <p className={`text-sm font-semibold ${charge.billing_status === 'failed' ? 'text-red-600' : 'text-gray-950'}`}>
                                            {formatINRFromPaise(charge.charged_amount_paise)}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">{new Date(charge.created_at).toLocaleDateString('en-IN')}</p>
                                    </div>
                                </div>
                            ))}
                            <div className="flex flex-col gap-3 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-gray-600">
                                    Yahan sirf latest usage charges preview hain. Baki broadcast/campaign details history me available hain.
                                </p>
                                <Link
                                    to="/broadcast"
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100"
                                >
                                    Open broadcast history
                                    <Megaphone className="h-4 w-4 text-blue-600" />
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
                            Details hidden. Ye compact latest usage preview hai; full broadcast history Broadcasts page me milegi.
                        </div>
                    )}
                </section>

                <section data-tour="billing-plans" className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-gray-950">Subscription Plans</h2>
                            <p className="mt-1 text-sm text-gray-500">Plan access ke liye hai. WhatsApp message spend wallet/recharge se alag chalega.</p>
                        </div>
                        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
                            <div className="inline-flex w-full rounded-xl border border-gray-200 bg-white p-1 shadow-sm sm:w-fit">
                                {BILLING_INTERVALS.map(item => (
                                    <button
                                        key={item.months}
                                        type="button"
                                        onClick={() => setInterval(item.months)}
                                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${interval === item.months ? 'bg-[#128C7E] text-white shadow-sm' : 'text-gray-600 hover:bg-emerald-50 hover:text-[#075E54]'
                                            }`}
                                    >
                                        {item.label}
                                        {item.discount > 0 && <span className="ml-2 text-xs text-green-500">-{item.discount}%</span>}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <CreditCard className="h-4 w-4" />
                                Razorpay secure checkout
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {plans.map(plan => {
                            const price = getPlanPrice(plan, interval)
                            const monthlyEquivalent = getMonthlyEquivalent(plan, interval)
                            const current = isCurrentPlan(currentPlan, plan)
                            const badge = plan.badge || getPlanBadge(plan.id)
                            return (
                                <article
                                    key={plan.id}
                                    className={`relative rounded-xl border p-5 ${plan.id === 'growth' ? 'border-[#128C7E] bg-gradient-to-br from-[#075E54] via-[#0b6f63] to-[#128C7E] text-white shadow-lg shadow-emerald-900/10' : 'border-gray-200 bg-white text-gray-950'
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
                                        <p className="flex items-baseline gap-1 text-3xl font-bold">
                                            {formatINRFromPaise(monthlyEquivalent)}
                                            {price !== 0 && <span className={`text-sm font-medium ${plan.id === 'growth' ? 'text-emerald-100' : 'text-gray-500'}`}>/month</span>}
                                        </p>
                                        <p className={`mt-1 text-xs ${plan.id === 'growth' ? 'text-gray-300' : 'text-gray-500'}`}>
                                            {price === 0 ? 'Forever' : interval === 12 ? `${formatINRFromPaise(price)} billed yearly` : 'Billed monthly'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={current || upgrading === plan.id}
                                        onClick={() => handleUpgrade(plan)}
                                        className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-default disabled:opacity-60 ${plan.id === 'growth'
                                            ? 'bg-white text-[#075E54] hover:bg-emerald-50'
                                            : 'bg-[#128C7E] text-white hover:bg-[#075E54]'
                                            }`}
                                    >
                                        {upgrading === plan.id ? 'Processing...' : current ? 'Current Plan' : `Upgrade to ${plan.name}`}
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

                {/* ═══════════════════════════════════════════════════════════════
                    COMPREHENSIVE PLANS COMPARISON SECTION
                ═══════════════════════════════════════════════════════════════ */}
                <section className="space-y-6">
                    <div className="text-center space-y-3 mt-8 mb-4">
                        <span className="text-[11px] font-extrabold text-emerald-600 uppercase tracking-widest flex items-center justify-center gap-2">
                            <Hexagon className="h-4 w-4 text-emerald-600 stroke-[2.5]" />
                            Full Comparison
                        </span>
                        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight leading-snug">
                            Every feature, every plan—checks<br className="hidden sm:inline" /> for included, crosses for not yet
                        </h2>
                        <p className="text-sm text-gray-500 max-w-2xl mx-auto font-medium">
                            Full matrix on desktop—checks for included, crosses for not yet.
                        </p>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[700px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="p-5 text-xs font-bold text-gray-400 uppercase tracking-wider w-2/5">Capability</th>
                                        <th className="p-5 text-center text-xs font-bold text-gray-900 uppercase tracking-wider w-1/5">Starter</th>
                                        <th className="p-5 text-center text-xs font-bold bg-emerald-50/50 text-[#075E54] uppercase tracking-wider w-1/5 relative">
                                            <span className="block font-black">Growth</span>
                                            <span className="block text-[8px] font-extrabold text-emerald-600 tracking-widest mt-0.5">RECOMMENDED</span>
                                        </th>
                                        <th className="p-5 text-center text-xs font-bold text-gray-900 uppercase tracking-wider w-1/5">Pro</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {/* Category 1 */}
                                    <tr className="bg-gray-50/50">
                                        <td colSpan="4" className="px-5 py-3 text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                                            Service, Campaigns & Account
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Unlimited free service conversations</td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Tick /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Unlimited campaigns (subject to Facebook Business Manager verification)</td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Tick /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Contact list limit</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">1,000</td>
                                        <td className="px-5 py-4 text-center text-sm font-black text-[#075E54] bg-emerald-50/20">10,000</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">50,000</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Connected WhatsApp numbers</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">1 number</td>
                                        <td className="px-5 py-4 text-center text-sm font-black text-[#075E54] bg-emerald-50/20">1 number</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">2 numbers</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Broadcast multi-media messages</td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Tick /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Carousel feature</td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Tick /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Dedicated onboarding help</td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Tick /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Blue tick application process help</td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Tick /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>

                                    {/* Category 2 */}
                                    <tr className="bg-gray-50/50">
                                        <td colSpan="4" className="px-5 py-3 text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                                            Automation & AI
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Max automation flows</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">5 flows</td>
                                        <td className="px-5 py-4 text-center text-sm font-black text-[#075E54] bg-emerald-50/20">Unlimited</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">Unlimited</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">AI agents included</td>
                                        <td className="px-5 py-4 text-center"><Cross /></td>
                                        <td className="px-5 py-4 text-center text-sm font-black text-[#075E54] bg-emerald-50/20">5 agents</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">Unlimited</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Visual chatbot flow builder</td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Tick /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Custom fields, tags & attributes</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">Basic</td>
                                        <td className="px-5 py-4 text-center text-sm font-black text-[#075E54] bg-emerald-50/20">Advanced</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">Advanced</td>
                                    </tr>

                                    {/* Category 3 */}
                                    <tr className="bg-gray-50/50">
                                        <td colSpan="4" className="px-5 py-3 text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                                            Campaign Tools & Analytics
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Campaign scheduler</td>
                                        <td className="px-5 py-4 text-center"><Cross /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Cross /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Detailed analytics dashboard</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">Basic</td>
                                        <td className="px-5 py-4 text-center text-sm font-black text-[#075E54] bg-emerald-50/20">Standard</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">Advanced</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Contact list exports (CSV)</td>
                                        <td className="px-5 py-4 text-center"><Cross /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Cross /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Developer API & Webhooks</td>
                                        <td className="px-5 py-4 text-center"><Cross /></td>
                                        <td className="px-5 py-4 text-center bg-emerald-50/20"><Cross /></td>
                                        <td className="px-5 py-4 text-center"><Tick /></td>
                                    </tr>

                                    {/* Category 4 */}
                                    <tr className="bg-gray-50/50">
                                        <td colSpan="4" className="px-5 py-3 text-xs font-extrabold text-gray-500 uppercase tracking-wider">
                                            Team & Support
                                        </td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Team inbox seats (Agents)</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">5 agents</td>
                                        <td className="px-5 py-4 text-center text-sm font-black text-[#075E54] bg-emerald-50/20">5 agents</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">10 agents</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50/50 transition-colors duration-150">
                                        <td className="px-5 py-4 text-sm font-semibold text-gray-700">Customer support level</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">Standard support</td>
                                        <td className="px-5 py-4 text-center text-sm font-black text-[#075E54] bg-emerald-50/20">Priority support</td>
                                        <td className="px-5 py-4 text-center text-sm font-bold text-gray-600">Dedicated VIP support</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white">
                    <div className="border-b border-gray-100 p-5">
                        <h2 className="text-base font-semibold text-gray-950">Recent Wallet Transactions</h2>
                        <p className="mt-1 text-sm text-gray-500">Sirf wallet recharge, refund, adjustment ya payment entries. Broadcast/message usage upar separate section me hai.</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {walletTransactions.length === 0 ? (
                            <p className="p-5 text-sm text-gray-500">Abhi wallet recharge/refund transaction history empty hai.</p>
                        ) : walletTransactions.map(tx => {
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

function getMessageChargeTitle(charge) {
    const source = String(charge.source || '').toLowerCase()
    const category = String(charge.category || 'message').replaceAll('_', ' ')
    if (source === 'broadcast') return `Broadcast ${category} charge`
    if (source === 'flow') return `Flow automation ${category} charge`
    if (source === 'ai_agent') return `AI agent ${category} charge`
    if (source === 'manual') return `Manual message ${category} charge`
    return `WhatsApp ${category} charge`
}

function Tick() {
    return (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] transition-transform duration-200 hover:scale-110">
            <Check className="h-4 w-4 stroke-[2.5]" />
        </span>
    );
}

function Cross() {
    return (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-50 text-gray-400 border border-gray-200 transition-transform duration-200 hover:scale-110">
            <X className="h-4 w-4 stroke-[2]" />
        </span>
    );
}
