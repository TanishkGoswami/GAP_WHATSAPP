import { useState } from 'react'
import { Check, Zap, Smartphone, Star, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

function hasPaidPlan(plan) {
    if (!plan) return false
    const p = plan.toLowerCase()
    return p !== 'free' && p !== ''
}

const PLANS = [
    {
        name: 'Free',
        id: 'free',
        price: { 1: 0 },
        description: 'Basic WhatsApp automation for small teams.',
        icon: <Zap size={20} />,
        features: [
            '1 WhatsApp number',
            'Up to 500 contacts',
            'Basic auto-responder',
            'Flow builder (3 flows)',
            'Community support',
        ],
        cta: 'Current Plan',
        highlighted: false,
    },
    {
        name: 'WhatsApp Pro',
        id: 'whatsapp_pro',
        price: { 1: 1599, 3: 1399, 6: 1299 },
        description: 'Full automation for growing businesses.',
        icon: <Smartphone size={20} />,
        features: [
            'Unlimited contacts',
            'Unlimited bulk messaging',
            'Advanced chatbot builder',
            'Unlimited flows',
            'Broadcast campaigns',
            'Contact management & tags',
            'WhatsApp support',
        ],
        cta: 'Upgrade to Pro',
        highlighted: true,
        badge: 'Most popular',
    },
    {
        name: 'WhatsApp Premium',
        id: 'whatsapp_premium',
        price: { 1: 2999, 3: 2699, 6: 2499 },
        description: 'Official API access + advanced integrations.',
        icon: <Star size={20} />,
        features: [
            'Everything in Pro',
            'Official Cloud API setup',
            'Green Tick assistance',
            'CRM integration',
            'Multi-agent live chat',
            'Advanced analytics',
            'Dedicated support',
        ],
        cta: 'Upgrade to Premium',
        highlighted: false,
    },
]

const INTERVALS = [
    { months: 1, discount: 0, label: '1 Month' },
    { months: 3, discount: 13, label: '3 Months' },
    { months: 6, discount: 19, label: '6 Months' },
]

export default function BillingPage() {
    const { user, refreshProfile } = useAuth()
    const [billing, setBilling] = useState(1)
    const [upgrading, setUpgrading] = useState(null)

    const currentPlanName = user?.plan || 'Free'
    const isPaid = hasPaidPlan(currentPlanName)

    const handleUpgrade = async (plan) => {
        if (plan.id === 'free' || currentPlanName === plan.name) return

        try {
            setUpgrading(plan.id)

            const { data, error } = await supabase.functions.invoke('create-whatsapp-payment-link', {
                body: {
                    planId: plan.id,
                    interval: billing,
                    userId: user?.id,
                    customerName: user?.user_metadata?.full_name || user?.email?.split('@')[0],
                    customerEmail: user?.email,
                },
            })

            if (error) throw error
            if (data?.success && data?.payment_link) {
                window.location.href = data.payment_link
            } else {
                throw new Error(data?.error || 'Failed to create payment link')
            }
        } catch (err) {
            console.error('Upgrade error:', err)
            alert(err.message || 'Something went wrong. Please try again.')
        } finally {
            setUpgrading(null)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-semibold text-gray-900 mb-1">Billing & Plans</h1>
                    <p className="text-sm text-gray-500">Manage your WhatsApp subscription.</p>
                </div>

                {/* Current plan banner */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-8 flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Current Plan</div>
                        <div className="text-xl font-semibold text-gray-900">{currentPlanName}</div>
                    </div>
                    {isPaid && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-full border border-gray-200">
                            <AlertCircle size={13} />
                            Subscription managed via getaipilot.in
                        </div>
                    )}
                </div>

                {/* Interval toggle */}
                <div className="flex justify-center mb-8">
                    <div className="inline-flex items-center bg-white border border-gray-200 rounded-full p-1 gap-1">
                        {INTERVALS.map(({ months, discount, label }) => (
                            <button
                                key={months}
                                onClick={() => setBilling(months)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                                    billing === months
                                        ? 'bg-gray-900 text-white'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                {label}
                                {discount > 0 && (
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                        billing === months
                                            ? 'bg-green-500/20 text-green-300'
                                            : 'bg-green-100 text-green-600'
                                    }`}>
                                        -{discount}%
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Plan cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                    {PLANS.map((plan) => {
                        const isCurrentPlan = currentPlanName === plan.name
                        const price = plan.price[billing] ?? plan.price[1]

                        return (
                            <div
                                key={plan.name}
                                className={`relative rounded-2xl overflow-hidden transition-all ${
                                    plan.highlighted
                                        ? 'bg-gray-900 shadow-2xl scale-[1.02]'
                                        : 'bg-white border border-gray-200'
                                }`}
                            >
                                {/* Badge */}
                                {(plan.badge && !isCurrentPlan) && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-b-lg">
                                        {plan.badge}
                                    </div>
                                )}
                                {isCurrentPlan && (
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-b-lg">
                                        Current Plan
                                    </div>
                                )}

                                <div className="p-7 pt-9">
                                    {/* Icon */}
                                    <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-5 ${
                                        plan.highlighted
                                            ? 'bg-green-500/20 text-green-400'
                                            : 'bg-gray-100 text-gray-700'
                                    }`}>
                                        {plan.icon}
                                    </div>

                                    {/* Name + desc */}
                                    <div className="mb-5">
                                        <div className={`text-lg font-semibold mb-1 ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                                            {plan.name}
                                        </div>
                                        <div className={`text-sm ${plan.highlighted ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {plan.description}
                                        </div>
                                    </div>

                                    {/* Price */}
                                    <div className="mb-6">
                                        <div className="flex items-end gap-1">
                                            <span className={`text-4xl font-bold tracking-tight ${plan.highlighted ? 'text-white' : 'text-gray-900'}`}>
                                                ₹{price}
                                            </span>
                                            <span className={`text-sm mb-1.5 ${plan.highlighted ? 'text-gray-400' : 'text-gray-400'}`}>
                                                {price === 0 ? 'forever' : '/ mo'}
                                            </span>
                                        </div>
                                        {billing > 1 && price > 0 && (
                                            <div className="text-xs text-green-500 mt-1 font-medium">
                                                Billed ₹{price * billing} every {billing} months · Save ₹{(plan.price[1] - price) * billing}
                                            </div>
                                        )}
                                    </div>

                                    {/* CTA */}
                                    <button
                                        onClick={() => handleUpgrade(plan)}
                                        disabled={upgrading === plan.id || isCurrentPlan}
                                        className={`w-full py-3 rounded-xl text-sm font-semibold transition-all mb-6 ${
                                            isCurrentPlan
                                                ? `opacity-50 cursor-default ${plan.highlighted ? 'bg-white/10 text-white' : 'bg-gray-100 text-gray-400'}`
                                                : plan.highlighted
                                                    ? 'bg-white text-gray-900 hover:bg-gray-100'
                                                    : 'bg-gray-900 text-white hover:bg-gray-800'
                                        } disabled:opacity-60`}
                                    >
                                        {upgrading === plan.id ? 'Processing...' : isCurrentPlan ? 'Current Plan' : plan.cta}
                                    </button>

                                    {/* Divider */}
                                    <div className={`border-t mb-5 ${plan.highlighted ? 'border-white/10' : 'border-gray-100'}`} />

                                    {/* Features */}
                                    <ul className="space-y-3">
                                        {plan.features.map(f => (
                                            <li key={f} className="flex items-start gap-3">
                                                <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                                    plan.highlighted ? 'bg-green-500/20' : 'bg-gray-100'
                                                }`}>
                                                    <Check size={11} className={plan.highlighted ? 'text-green-400' : 'text-gray-600'} strokeWidth={2.5} />
                                                </span>
                                                <span className={`text-sm ${plan.highlighted ? 'text-gray-300' : 'text-gray-600'}`}>
                                                    {f}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )
                    })}
                </div>

                <p className="text-center text-xs text-gray-400 mt-8">
                    Payments processed securely via Razorpay. Subscription managed at{' '}
                    <a href="https://getaipilot.in" className="underline" target="_blank" rel="noopener noreferrer">
                        getaipilot.in
                    </a>
                </p>
            </div>
        </div>
    )
}
