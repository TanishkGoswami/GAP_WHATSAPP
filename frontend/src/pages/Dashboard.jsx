import { createElement, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Bot,
    CheckCircle2,
    ChevronDown,
    Clock3,
    FileText,
    Gauge,
    Grid2X2,
    Image as ImageIcon,
    MessageSquareText,
    PhoneCall,
    RefreshCw,
    Send,
    Smartphone,
    Sparkles,
    TrendingUp,
    UserRoundCheck,
    Users,
    Wallet,
    Workflow,
    Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { formatINRFromPaise } from '../config/whatsappPricing'


const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

const ranges = [
    { label: 'Today', value: 'today' },
    { label: '7 days', value: '7d' },
    { label: '30 days', value: '30d' },
]

const formatter = new Intl.NumberFormat('en-IN')

function n(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function fmt(value) {
    return formatter.format(n(value))
}

function compact(value) {
    return new Intl.NumberFormat('en-IN', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(n(value))
}

function pct(value) {
    return `${Math.max(0, Math.min(100, Math.round(n(value))))}%`
}

function contactsFrom(stats) {
    return typeof stats?.contacts === 'number'
        ? { total: stats.contacts, saved: 0 }
        : { total: n(stats?.contacts?.total), saved: n(stats?.contacts?.saved) }
}

function freshness(updatedAt) {
    if (!updatedAt) return 'Waiting for sync'
    const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
    if (seconds < 10) return 'Updated just now'
    if (seconds < 60) return `Updated ${seconds}s ago`
    return `Updated ${Math.round(seconds / 60)}m ago`
}

export default function Dashboard() {
    const { apiCall, session } = useAuth()
    const [range, setRange] = useState('today')
    const [isAccountsOpen, setIsAccountsOpen] = useState(false)

    const {
        data: stats,
        isLoading,
        isFetching,
        dataUpdatedAt,
        error,
        refetch,
    } = useQuery({
        queryKey: ['dashboard-stats', session?.access_token, range],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/dashboard-stats?range=${encodeURIComponent(range)}`)
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body?.error || 'Failed to fetch dashboard stats')
            return body
        },
        staleTime: 1000 * 30,
        refetchInterval: 15000,
        enabled: !!session?.access_token,
    })

    const { data: billingOverview } = useQuery({
        queryKey: ['billing-overview-compact', session?.access_token],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/billing/overview`)
            const body = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(body?.error || 'Failed to fetch billing overview')
            return body
        },
        staleTime: 1000 * 60,
        refetchInterval: 60000,
        enabled: !!session?.access_token,
    })

    const model = useMemo(() => {
        const metrics = stats?.metrics || {}
        const contacts = contactsFrom(stats)
        const conversations = stats?.conversations || {}
        const accounts = stats?.accounts || {}
        const automation = stats?.automation || {}
        const campaigns = stats?.campaigns || {}

        const totalMessages = n(metrics.totalMessages)
        const delivered = n(metrics.delivered)
        const read = n(metrics.read)
        const failed = n(metrics.failed)
        const pending = Math.max(0, n(metrics.pending, totalMessages - delivered - failed))
        const deliveryRate = n(metrics.deliveryRate, totalMessages ? (delivered / totalMessages) * 100 : 0)
        const readRate = n(metrics.readRate, totalMessages ? (read / totalMessages) * 100 : 0)
        const failedRate = n(metrics.failedRate, totalMessages ? (failed / totalMessages) * 100 : 0)
        const quality = n(stats?.health?.quality, Math.max(0, 100 - Math.round(failedRate * 2)))

        return {
            metrics,
            contacts,
            conversations,
            accounts,
            automation,
            campaigns,
            totalMessages,
            delivered,
            read,
            failed,
            pending,
            deliveryRate,
            readRate,
            failedRate,
            quality,
            timeline: Array.isArray(stats?.timeline) ? stats.timeline : [],
            hourlyTimeline: Array.isArray(stats?.hourlyTimeline) ? stats.hourlyTimeline : [],
            recentActivity: Array.isArray(stats?.recentActivity) ? stats.recentActivity : [],
        }
    }, [stats])

    const rangeLabel = ranges.find(item => item.value === range)?.label || 'Today'
    const healthLabel = model.failedRate > 15 ? 'Needs review' : model.failedRate > 5 ? 'Monitor' : 'Healthy'
    const hasConnectedAccount = n(model.accounts.active) > 0

    return (
        <div className="min-h-full bg-[#f5f7fa]">
            <div className="mx-auto max-w-[1680px] space-y-5">
                <Header
                    range={range}
                    setRange={setRange}
                    isFetching={isFetching}
                    refetch={refetch}
                    freshness={freshness(dataUpdatedAt)}
                />

                {error ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error.message}
                    </div>
                ) : null}

                {!isLoading && !hasConnectedAccount ? <FirstRunOnboarding /> : null}

                <section data-tour="dashboard-metrics" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard icon={MessageSquareText} label="Messages" value={fmt(model.totalMessages)} detail={`${rangeLabel} synced`} loading={isLoading} />
                    <MetricCard icon={Users} label="Customer messages" value={fmt(model.metrics.inbound)} detail="Inbound activity" loading={isLoading} />
                    <MetricCard icon={Bot} label="AI + team replies" value={fmt(n(model.metrics.aiAgent) + n(model.metrics.humanAgent))} detail={`${fmt(model.metrics.aiAgent)} AI / ${fmt(model.metrics.humanAgent)} human`} loading={isLoading} />
                    <MetricCard icon={AlertTriangle} label="Failed delivery" value={`${model.failedRate.toFixed(1)}%`} detail={`${fmt(model.failed)} messages`} warning={model.failedRate > 5} loading={isLoading} />
                </section>

                <div data-tour="dashboard-wallet">
                    <BillingOverviewStrip overview={billingOverview} />
                </div>

                <section data-tour="dashboard-overview" className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
                    <UsagePerformanceDashboard
                        model={model}
                        range={range}
                        rangeLabel={rangeLabel}
                        loading={isLoading}
                        overview={billingOverview}
                        healthLabel={healthLabel}
                    />

                    <div data-tour="dashboard-health">
                        <Panel title="System health" subtitle="Current account, inbox, and automation state." action={<Gauge className="h-4 w-4 text-gray-400" />}>
                            <div className="space-y-2.5">
                                {/* Interactive WhatsApp Accounts Row (Apple x Vercel Styled accordion) */}
                                <div className="flex flex-col rounded-lg bg-[#f5f7fa] overflow-hidden border border-transparent hover:border-gray-200 transition-all">
                                    <button
                                        type="button"
                                        onClick={() => setIsAccountsOpen(prev => !prev)}
                                        className="flex items-center justify-between gap-4 px-4 py-3 text-left focus:outline-none w-full"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className={`rounded-lg p-2 ${n(model.accounts.active) > 0 ? 'bg-white text-[#0064b7]' : 'bg-amber-50 text-amber-600'}`}>
                                                <Smartphone className="h-4 w-4" />
                                            </span>
                                            <span className="truncate text-sm font-medium text-gray-700">WhatsApp accounts</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="text-sm font-semibold text-black">
                                                {`${fmt(model.accounts.active)} active / ${fmt(model.accounts.total)} total`}
                                            </span>
                                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isAccountsOpen ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {isAccountsOpen && (
                                        <div className="border-t border-gray-100 bg-white/50 px-4 py-2.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                            {Array.isArray(model.accounts.connected) && model.accounts.connected.length > 0 ? (
                                                model.accounts.connected.map(acc => {
                                                    const isActive = acc.status !== 'disconnected' && acc.status !== 'failed';
                                                    return (
                                                        <div key={acc.id} className="flex items-center justify-between py-1.5 border-b border-gray-50/50 last:border-b-0">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200/40 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] text-gray-500">
                                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                                                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                                                    </svg>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="font-mono text-xs font-semibold tracking-tight text-gray-900 truncate">
                                                                        {acc.display_phone_number || 'Unknown'}
                                                                    </p>
                                                                    <p className="text-[10px] text-gray-400 truncate mt-0.5">
                                                                        {acc.name || 'WhatsApp Business'}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1.5">
                                                                {isActive ? (
                                                                    <>
                                                                        <span className="relative flex h-1 w-1">
                                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                            <span className="relative inline-flex rounded-full h-1 w-1 bg-emerald-500"></span>
                                                                        </span>
                                                                        <span className="text-[9px] font-mono tracking-wider uppercase text-gray-500 font-semibold">
                                                                            Active
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <span className="relative inline-flex rounded-full h-1 w-1 bg-gray-300"></span>
                                                                        <span className="text-[9px] font-mono tracking-wider uppercase text-gray-400 font-semibold">
                                                                            Offline
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <p className="text-[11px] text-gray-400 py-1">No connected numbers found.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <HealthRow icon={MessageSquareText} label="Conversations" value={fmt(model.conversations.total)} active />
                                <HealthRow icon={Bot} label="Bot active chats" value={fmt(model.conversations.botActive)} active />
                                <HealthRow icon={FileText} label="AI summaries ready" value={fmt(model.conversations.summariesReady)} active />
                                <HealthRow icon={AlertTriangle} label="Unread messages" value={fmt(model.conversations.unread)} active={n(model.conversations.unread) === 0} />
                            </div>
                        </Panel>
                        
                        <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm">
                            <img src="https://i.pinimg.com/1200x/8f/b0/9b/8fb09bb1139abe85eec8e3fbeab528b2.jpg" alt="Dashboard Illustration" className="w-full h-[400px] object-cover" />
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
                    <Panel title="Contact readiness" subtitle="Customer data and saved-contact coverage.">
                        <div className="grid grid-cols-2 gap-3">
                            <MiniStat icon={Users} label="Contacts" value={fmt(model.contacts.total)} />
                            <MiniStat icon={UserRoundCheck} label="Saved" value={fmt(model.contacts.saved)} />
                            <MiniStat icon={TrendingUp} label="AI notes" value={fmt(model.automation.notesGenerated)} />
                            <MiniStat icon={Clock3} label="Handoffs" value={fmt(model.conversations.humanHandoff)} />
                        </div>
                    </Panel>

                    <Panel title="Automation" subtitle="Flows, bot coverage, and broadcast output.">
                        <div className="space-y-2.5">
                            <InfoLine icon={Workflow} label="Flows" value={`${fmt(model.automation.publishedFlows)} published / ${fmt(model.automation.flows)} total`} />
                            <InfoLine icon={Bot} label="Bot-enabled chats" value={fmt(model.automation.activeFlowSessions)} />
                            <InfoLine icon={Send} label="Broadcast messages" value={`${fmt(model.campaigns.sent)} sent / ${fmt(model.campaigns.failed)} failed`} />
                        </div>
                    </Panel>

                    <Panel title="Quick actions" subtitle="Shortcuts for daily operations." action={<Zap className="h-4 w-4 text-[#0070d1]" />}>
                        <div className="space-y-2.5">
                            {!hasConnectedAccount ? (
                                <QuickAction
                                    to="/whatsapp-connect"
                                    icon={Smartphone}
                                    title="Connect WhatsApp first"
                                    text="Required before chats, templates and automations can work."
                                    primary
                                />
                            ) : null}
                            <QuickAction to="/live-chat" icon={MessageSquareText} title="Open chats" text="Reply and review summaries." />
                            <QuickAction to="/bot-agents" icon={Bot} title="Manage AI agents" text="Tune replies and handoff rules." />
                            <QuickAction to="/broadcast" icon={Send} title="Create broadcast" text="Send campaigns with quality in view." />
                        </div>
                    </Panel>
                </section>

                <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_0.7fr]">
                    <Panel title="Recent activity" subtitle="Latest real messages synced from WhatsApp.">
                        <div className="space-y-2">
                            {isLoading ? (
                                Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={index} />)
                            ) : model.recentActivity.length ? (
                                model.recentActivity.map(item => <ActivityRow key={item.id} item={item} />)
                            ) : (
                                <EmptyState icon={Activity} title="No activity yet" text={`No messages found for ${rangeLabel.toLowerCase()}.`} />
                            )}
                        </div>
                    </Panel>

                    <Panel title="Campaigns" subtitle="Broadcast rows from your database.">
                        <div className="space-y-2">
                            {model.campaigns.latest?.length ? (
                                model.campaigns.latest.map(campaign => <CampaignRow key={campaign.id} campaign={campaign} />)
                            ) : (
                                <EmptyState icon={Send} title="No campaigns yet" text="Campaigns will appear here once created." />
                            )}
                        </div>
                    </Panel>
                </section>
            </div>
        </div>
    )
}

function FirstRunOnboarding() {
    const steps = [
        {
            icon: Smartphone,
            title: 'Connect WhatsApp',
            text: 'Apna business number official Meta Cloud API se link karein. Ye sabse pehla aur most important step hai.',
        },
        {
            icon: Wallet,
            title: 'Add wallet balance',
            text: 'WhatsApp conversations ke charges wallet se deduct honge. Low balance hone par sending stop ho sakti hai.',
        },
        {
            icon: FileText,
            title: 'Create templates',
            text: 'Broadcasts and proactive messages ke liye Meta-approved templates required hote hain.',
        },
        {
            icon: Bot,
            title: 'Enable AI/flows',
            text: 'Number connect hone ke baad chats, agents, flows and broadcasts meaningful data dikhayenge.',
        },
    ]

    return (
        <section className="overflow-hidden rounded-lg border border-[#b9dcfb] bg-white">
            <div className="grid gap-0 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                <div className="relative border-b border-[#d9ecfd] bg-[#eef7ff] p-5 sm:p-6 xl:border-b-0 xl:border-r">
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#b9dcfb] bg-white px-3 py-1 text-xs font-semibold text-[#0064b7]">
                        <Sparkles className="h-3.5 w-3.5" />
                        First-time setup
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold leading-tight text-black lg:max-w-[560px]">Dashboard empty hai because WhatsApp account abhi connected nahi hai.</h2>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-700 lg:max-w-[560px]">
                        Non-tech flow simple hai: pehle WhatsApp business number connect karo, phir wallet/templates setup karo. Uske baad chats, delivery reports, broadcasts and AI automation yahin real data ke saath show honge.
                    </p>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <Link
                            to="/whatsapp-connect"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#128C7E]"
                        >
                            <Smartphone className="h-4 w-4" />
                            Connect WhatsApp account
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            to="/whatsapp-number"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50"
                        >
                            <PhoneCall className="h-4 w-4" />
                            Need a new number?
                        </Link>
                    </div>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
                    {steps.map(step => (
                        <div key={step.title} className="group rounded-lg border border-gray-200 bg-[#fbfcfd] p-4 transition-colors hover:border-gray-300">
                            <div className="flex items-start justify-between">
                                {/* <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#0064b7] ring-1 ring-gray-200">
                                    {createElement(step.icon, { className: 'h-4 w-4' })}
                                </span> */}
                                
                            </div>
                            <h3 className="mt-3 text-sm font-semibold text-black">{step.title}</h3>
                            
                            <p className="mt-1 text-xs leading-5 text-gray-600">{step.text}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function Header({ range, setRange, isFetching, refetch, freshness }) {
    return (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
                <div className="flex items-center gap-2 text-sm font-medium text-[#0064b7]">
                    <Grid2X2 className="h-4 w-4" />
                    Command center
                </div>
                <h1 className="mt-1 text-[34px] font-light leading-tight tracking-normal text-black">Dashboard</h1>
                <p className="mt-1 text-sm leading-5 text-gray-600">Real WhatsApp performance, customer readiness, and automation health.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               
                <div data-tour="dashboard-range" className="inline-flex rounded-full border border-gray-200 bg-white p-1">
                    {ranges.map(item => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => setRange(item.value)}
                            className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${range === item.value ? 'bg-[#0070d1] text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-black'}`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => refetch()}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                >
                    <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
                <span className="inline-flex h-10 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {freshness}
                </span>
            </div>
        </div>
    )
}

function BillingOverviewStrip({ overview }) {
    const categories = overview?.spend?.categories || []
    const marketing = categories.find(item => item.category === 'marketing')
    const utility = categories.find(item => item.category === 'utility')

    return (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-600">Wallet balance</p>
                    <Wallet className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="mt-2 text-[28px] font-light leading-none text-black">{formatINRFromPaise(overview?.wallet?.balance_paise)}</p>
                <p className="mt-3 text-sm text-gray-600">Message charges yahin se deduct honge.</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <p className="text-sm font-medium text-gray-600">This month message spend</p>
                <p className="mt-2 text-[28px] font-light leading-none text-black">{formatINRFromPaise(overview?.spend?.month_spend_paise)}</p>
                <p className="mt-3 text-sm text-gray-600">Marketing, utility, auth, and service usage.</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-5">
                <p className="text-sm font-medium text-gray-600">Marketing / Utility</p>
                <p className="mt-2 text-[28px] font-light leading-none text-black">
                    {formatINRFromPaise(marketing?.charged_amount_paise)} / {formatINRFromPaise(utility?.charged_amount_paise)}
                </p>
                <p className="mt-3 text-sm text-gray-600">
                    {fmt(marketing?.message_count)} marketing, {fmt(utility?.message_count)} utility messages.
                </p>
            </div>
            <Link
                to="/billing"
                className="flex items-center justify-center gap-2 rounded-lg border border-gray-900 bg-black px-5 py-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
                Billing details
                <ArrowRight className="h-4 w-4" />
            </Link>
        </section>
    )
}

function Panel({ title, subtitle, action, children }) {
    return (
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
                <div>
                    <h2 className="text-base font-semibold text-black">{title}</h2>
                    {subtitle ? <p className="mt-1 text-sm leading-5 text-gray-600">{subtitle}</p> : null}
                </div>
                {action}
            </div>
            <div className="p-5">{children}</div>
        </section>
    )
}

function MetricCard({ icon, label, value, detail, warning, loading }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-medium text-gray-600">{label}</p>
                    {loading ? (
                        <div className="mt-3 h-8 w-20 animate-pulse rounded bg-gray-100" />
                    ) : (
                        <p className="mt-2 text-[32px] font-light leading-none text-black">{value}</p>
                    )}
                </div>
                <div className={`rounded-lg p-2.5 ${warning ? 'bg-red-50 text-red-600' : 'bg-[#f5f7fa] text-[#0064b7]'}`}>
                    {createElement(icon, { className: 'h-5 w-5' })}
                </div>
            </div>
            <p className="mt-5 text-sm text-gray-600">{detail}</p>
        </div>
    )
}

function UsagePerformanceDashboard({ model, range, rangeLabel, loading, overview, healthLabel }) {
    const isHourly = range === 'today'
    const timeline = isHourly ? model.hourlyTimeline : model.timeline
    const max = Math.max(1, ...timeline.map(point => n(point.total)))
    const total = timeline.reduce((sum, point) => sum + n(point.total), 0)
    const peak = timeline.reduce((best, point) => n(point.total) > n(best?.total) ? point : best, timeline[0] || null)
    const visibleBars = timeline.length ? timeline : Array.from({ length: isHourly ? 24 : 7 }).map((_, index) => ({
        hour: `${String(index).padStart(2, '0')}:00`,
        date: `Day ${index + 1}`,
        total: 0,
        read: 0,
        inbound: 0,
        outbound: 0,
        failed: 0,
    }))
    const monthSpendPaise = n(overview?.spend?.month_spend_paise)
    const todaySpendPaise = n(overview?.spend?.today_spend_paise)
    const walletPaise = n(overview?.wallet?.balance_paise)
    const availablePaise = Math.max(1, walletPaise + monthSpendPaise)
    const spendProgress = Math.min(100, Math.round((monthSpendPaise / availablePaise) * 100))
    const primaryLine = timeline.map(point => n(point.read) || n(point.outbound))
    const secondaryLine = timeline.map(point => n(point.inbound))
    const readSeries = timeline.map(point => n(point.read))
    const requestSeries = timeline.map(point => n(point.total))
    const summaryCards = [
        { label: 'Messages', value: fmt(model.totalMessages), detail: `${rangeLabel} volume`, color: 'text-[#6d5ce7]', accent: 'from-[#7b55de] to-[#a78bfa]', progress: 100 },
        { label: 'Delivered', value: fmt(model.delivered), detail: `${pct(model.deliveryRate)} success`, color: 'text-[#0070d1]', accent: 'from-[#0070d1] to-[#53b1ff]', progress: model.deliveryRate },
        { label: 'Read', value: fmt(model.read), detail: `${pct(model.readRate)} read rate`, color: 'text-emerald-600', accent: 'from-emerald-500 to-teal-400', progress: model.readRate },
        { label: 'Failed', value: fmt(model.failed), detail: `${model.failedRate.toFixed(1)}% risk`, color: model.failedRate > 5 ? 'text-red-600' : 'text-gray-900', accent: 'from-red-500 to-rose-400', progress: Math.max(4, model.failedRate) },
    ]
    const capabilityCards = [
        {
            title: 'Replies handled',
            value: `${fmt(n(model.metrics.aiAgent) + n(model.metrics.humanAgent))}`,
            detail: `${fmt(model.metrics.aiAgent)} AI / ${fmt(model.metrics.humanAgent)} team`,
            series: requestSeries,
            color: '#6d5ce7',
        },
        {
            title: 'Broadcast output',
            value: fmt(model.campaigns.sent),
            detail: `${fmt(model.campaigns.failed)} failed broadcast messages`,
            series: readSeries,
            color: '#0f766e',
        },
    ]

    return (
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-5 lg:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#0064b7]">
                            <BarChart3 className="h-4 w-4" />
                            Usage analytics
                        </div>
                        <h2 className="mt-1 text-2xl font-semibold leading-tight text-black">Message performance</h2>
                        {/* <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-600">
                            Live WhatsApp delivery, read activity, failure risk, and billing movement in one clean view.
                        </p> */}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800">
                            Workspace
                        </span>
                        <span className="inline-flex h-9 items-center rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-500">
                            All WhatsApp numbers
                        </span>
                        <span className="inline-flex h-9 items-center rounded-full border border-gray-900 bg-gray-900 px-3 text-sm font-semibold text-white">
                            {rangeLabel}
                        </span>
                        <StatusPill label={healthLabel} warning={model.failedRate > 5} />
                    </div>
                </div>
            </div>

            <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4 border-b border-gray-200 bg-white p-5 xl:border-b-0 xl:border-r xl:p-6">
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                        {summaryCards.map(card => (
                            <div key={card.label} className="group overflow-hidden rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
                                    <p className={`mt-2 text-2xl font-semibold leading-none ${card.color}`}>{card.value}</p>
                                    <p className="mt-2 text-xs text-gray-500">{card.detail}</p>
                                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                        <div className={`h-full rounded-full bg-gradient-to-r ${card.accent}`} style={{ width: pct(card.progress) }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-base font-semibold text-black">Message activity</p>
                                {/* <p className="mt-1 text-sm text-gray-500">{isHourly ? 'Hourly distribution for today.' : 'Daily trend for selected range.'}</p> */}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-500">Group by</span>
                                <span className="inline-flex h-8 items-center rounded-lg bg-gray-950 px-3 text-sm font-semibold text-white">
                                    {isHourly ? '1h' : '1d'}
                                </span>
                            </div>
                        </div>

                        {loading ? (
                            <div className="mt-4 h-[300px] animate-pulse rounded-lg bg-gray-50" />
                        ) : (
                            <UsageBarChart
                                bars={visibleBars}
                                max={max}
                                isHourly={isHourly}
                                peak={peak}
                                total={total}
                            />
                        )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {capabilityCards.map(card => (
                            <UsageCapabilityCard key={card.title} {...card} />
                        ))}
                    </div>
                </div>

                <aside className="space-y-4 bg-gray-50/50 p-5 xl:p-6">
                    <div className="rounded-lg bg-gray-950 p-5 text-white">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm text-gray-400">Delivery quality</p>
                                <p className="mt-2 text-[44px] font-light leading-none">{model.quality}<span className="text-xl text-gray-500">/100</span></p>
                            </div>
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4">
                            <QualityStat label="Delivered" value={compact(model.delivered)} />
                            <QualityStat label="Read" value={compact(model.read)} />
                            <QualityStat label="Pending" value={compact(model.pending)} />
                            <QualityStat label="Failed" value={compact(model.failed)} />
                        </div>
                        <p className="mt-5 text-sm leading-5 text-gray-400">
                            {model.totalMessages
                                ? `${pct(model.deliveryRate)} delivery with ${pct(model.readRate)} read rate.`
                                : `No message activity found for ${rangeLabel.toLowerCase()}.`}
                        </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-base font-semibold text-gray-900">Wallet spend</h3>
                            <Gauge className="h-4 w-4 text-gray-400" />
                        </div>
                        <div className="mt-4 flex items-center justify-between text-sm">
                            <span className="font-medium text-gray-600">This month</span>
                            <span className="font-semibold text-gray-900">{formatINRFromPaise(monthSpendPaise)}</span>
                        </div>
                        <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: pct(spendProgress) }} />
                        </div>
                        <p className="mt-2 text-xs text-gray-500">Wallet available: {formatINRFromPaise(walletPaise)}</p>
                    </div>


                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <UsageRailStat label="Today spend" value={formatINRFromPaise(todaySpendPaise)} />
                        <UsageRailStat label="AI replies" value={compact(model.metrics.aiAgent)} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <RateCard label="Delivery rate" value={model.deliveryRate} count={fmt(model.delivered)} color="bg-blue-600" />
                        <RateCard label="Read rate" value={model.readRate} count={fmt(model.read)} color="bg-emerald-500" />
                        <RateCard label="Pending" value={model.totalMessages ? (model.pending / model.totalMessages) * 100 : 0} count={fmt(model.pending)} color="bg-amber-500" />
                        <RateCard label="Failure risk" value={model.failedRate} count={`${model.failedRate.toFixed(1)}%`} color="bg-red-500" />
                    </div>
                </aside>
            </div>
        </section>
    )
}

function UsageBarChart({ bars, max, isHourly, peak, total }) {
    return (
        <div className="mt-4 rounded-2xl border border-[#dfe8f6] bg-gradient-to-br from-[#fbfdff] via-white to-[#f7f4ff] p-3 shadow-[0_12px_32px_rgba(109,92,231,0.08)] sm:p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-medium text-gray-500">Total volume</p>
                    <p className="text-xl font-semibold text-gray-950">{fmt(total)}</p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3 py-2 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-xs font-semibold text-gray-600">Peak</span>
                    <span className="text-sm font-semibold text-blue-700">{peak ? fmt(peak.total) : 0}</span>
                </div>
            </div>
            <div className="relative h-[285px] overflow-hidden rounded-xl border border-gray-200 bg-white px-3 pt-3">
                <div className="absolute inset-x-3 top-3 border-t border-dashed border-gray-200" />
                <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-gray-200" />
                <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-gray-200" />
                <div className="absolute inset-x-3 bottom-10 border-t border-gray-200" />
                <div className="absolute inset-x-3 bottom-11 top-5 flex items-end justify-between gap-1.5">
                    {bars.map((point, index) => {
                        const value = n(point.total)
                        const height = value === 0 ? 3 : Math.max(10, (value / max) * 215)
                        const key = isHourly ? point.hour : point.date
                        const label = isHourly ? point.hour : point.date?.slice(5)
                        const showLabel = isHourly ? index % 4 === 0 : index === 0 || index === bars.length - 1
                        return (
                            <div key={`${key}-${index}`} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                                <div className="pointer-events-none absolute bottom-[calc(100%+10px)] z-10 hidden min-w-[104px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-center text-xs shadow-[0_16px_40px_rgba(15,23,42,0.14)] group-hover:block">
                                    <p className="font-semibold text-gray-900">{label}</p>
                                    <p className="mt-1 text-gray-600">{fmt(value)} messages</p>
                                </div>
                                <div
                                    className="w-full max-w-8 rounded-t-xl bg-gradient-to-t from-blue-600 to-blue-400 transition-all duration-300 group-hover:scale-x-110 group-hover:from-blue-700 group-hover:to-blue-500"
                                    style={{ height }}
                                    title={`${label}: ${fmt(value)} messages`}
                                />
                                <span className="h-4 w-12 truncate text-center text-[10px] font-medium text-gray-500">{showLabel ? label : ''}</span>
                            </div>
                        )
                    })}
                </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                <span>{isHourly ? '00:00' : bars[0]?.date?.slice(5) || 'Start'}</span>
                <span className="hidden sm:inline">{isHourly ? 'Hourly WhatsApp message activity' : 'Daily WhatsApp message activity'}</span>
                <span>{isHourly ? '23:00' : bars[bars.length - 1]?.date?.slice(5) || 'End'}</span>
            </div>
        </div>
    )
}

function UsageTrendCard({ primary, secondary, primaryLabel, secondaryLabel, primaryColor, secondaryColor }) {
    const chartWidth = 260
    const chartHeight = 92
    const maxValue = Math.max(1, ...primary.map(value => n(value)), ...secondary.map(value => n(value)))
    const primaryPoints = getScaledLinePoints(primary, maxValue, chartWidth, chartHeight)
    const secondaryPoints = getScaledLinePoints(secondary, maxValue, chartWidth, chartHeight)
    const primaryPath = pointsToPath(primaryPoints)
    const secondaryPath = pointsToPath(secondaryPoints)
    const primaryLast = primaryPoints[primaryPoints.length - 1] || { x: chartWidth, y: chartHeight }
    const secondaryLast = secondaryPoints[secondaryPoints.length - 1] || { x: chartWidth, y: chartHeight }

    return (
        <div className="mt-4 rounded-2xl border border-[#dfe8f6] bg-gradient-to-br from-[#fbfdff] via-white to-[#f7fffb] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs font-medium text-gray-600">
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: primaryColor }} />
                        {primaryLabel}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: secondaryColor }} />
                        {secondaryLabel}
                    </span>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200">
                    Live synced rows
                </span>
            </div>
            <div className="relative mt-4 h-[148px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-inner">
                <div className="pointer-events-none absolute -left-16 bottom-0 h-28 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="pointer-events-none absolute -right-16 top-0 h-28 w-48 rounded-full bg-pink-400/10 blur-3xl" />
                <div className="absolute inset-x-0 top-1/4 border-t border-dashed border-gray-200" />
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-200" />
                <div className="absolute inset-x-0 top-3/4 border-t border-dashed border-gray-200" />
                <svg className="absolute inset-0 h-full w-full overflow-visible px-3 py-4" viewBox="0 0 260 92" preserveAspectRatio="none" aria-hidden="true">
                    <path d={`${primaryPath} L 260 92 L 0 92 Z`} fill="rgba(15,118,110,0.06)" />
                    <path d={primaryPath} fill="none" stroke={primaryColor} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
                    <path d={secondaryPath} fill="none" stroke={secondaryColor} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx={primaryLast.x} cy={primaryLast.y} r="3" fill="white" stroke={primaryColor} strokeWidth="1.8" />
                    <circle cx={secondaryLast.x} cy={secondaryLast.y} r="3" fill="white" stroke={secondaryColor} strokeWidth="1.8" />
                </svg>
            </div>
        </div>
    )
}

function createLinePath(series, width = 260, height = 66) {
    const values = series.length ? series.map(value => n(value)) : [0, 0]
    const max = Math.max(1, ...values)
    const step = values.length > 1 ? width / (values.length - 1) : width
    return values.map((value, index) => {
        const x = index * step
        const y = height - ((value / max) * (height - 10)) - 5
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    }).join(' ')
}

function getScaledLinePoints(series, maxValue, width = 260, height = 92) {
    const values = series.length ? series.map(value => n(value)) : [0, 0]
    const max = Math.max(1, n(maxValue))
    const step = values.length > 1 ? width / (values.length - 1) : width

    return values.map((value, index) => ({
        x: index * step,
        y: height - ((value / max) * (height - 14)) - 7,
    }))
}

function pointsToPath(points) {
    return points.map((point, index) => (
        `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )).join(' ')
}

function UsageMiniLineCard({ label, value, primary, secondary, primaryColor, secondaryColor }) {
    return (
        <div>
            {label ? <p className="text-sm text-gray-600">{label}</p> : null}
            {value ? <p className="mt-1 text-xl font-semibold text-gray-950">{value}</p> : null}
            <svg className={label || value ? 'mt-3 h-[76px] w-full overflow-visible' : 'mt-4 h-[92px] w-full overflow-visible'} viewBox="0 0 260 76" preserveAspectRatio="none" aria-hidden="true">
                <path d={createLinePath(primary)} fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={createLinePath(secondary)} fill="none" stroke={secondaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="258" cy="38" r="4" fill="white" stroke={primaryColor} strokeWidth="2.5" />
                <circle cx="258" cy="66" r="4" fill="white" stroke={secondaryColor} strokeWidth="2.5" />
            </svg>
        </div>
    )
}

function UsageMiniBarsCard({ label, value, series }) {
    const values = series.length ? series : [0, 0, 0, 0, 0, 0, 0]
    const max = Math.max(1, ...values.map(item => n(item)))
    return (
        <div>
            <p className="text-sm text-gray-600">{label}</p>
            <p className="mt-1 text-xl font-semibold text-gray-950">{value}</p>
            <div className="mt-3 flex h-[76px] items-end gap-1 rounded-xl bg-gradient-to-b from-white to-[#f7f4ff] px-1 pb-1">
                {values.map((value, index) => (
                    <div
                        key={`${value}-${index}`}
                        className="flex-1 rounded-t-md bg-gradient-to-t from-[#5f49d8] to-[#a78bfa] shadow-[0_6px_14px_rgba(109,92,231,0.18)] transition-transform duration-300 hover:scale-y-105"
                        style={{ height: `${Math.max(4, (n(value) / max) * 70)}px` }}
                    />
                ))}
            </div>
        </div>
    )
}

function UsageCapabilityCard({ title, value, detail, series, color }) {
    return (
        <div className="group rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-[#fbfcfd] p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#c9ddff] hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    <p className="mt-2 text-2xl font-semibold leading-none text-gray-950">{value}</p>
                    <p className="mt-1 text-xs text-gray-400">{detail}</p>
                </div>
                <div className="h-12 w-24 rounded-xl bg-white/70 p-1">
                    <svg className="h-full w-full" viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true">
                        <path d={createLinePath(series, 120, 48)} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
            </div>
        </div>
    )
}

function UsageRailStat({ label, value }) {
    return (
        <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-white to-[#f5f7fa] p-3 shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
            <p className="font-medium text-gray-500">{label}</p>
            <p className="mt-1 text-sm font-semibold text-gray-950">{value}</p>
        </div>
    )
}

function TrendChart({ timeline, loading, range }) {
    const isHourly = range === 'today'
    const max = Math.max(1, ...timeline.map(point => n(point.total)))
    const total = timeline.reduce((sum, point) => sum + n(point.total), 0)
    const peak = timeline.reduce((best, point) => n(point.total) > n(best?.total) ? point : best, timeline[0] || null)
    const activePoints = timeline.filter(point => n(point.total) > 0).length
    const chartTitle = isHourly ? 'Hourly message activity' : 'Message trend'
    const chartSubtitle = isHourly ? 'Messages grouped by hour for today.' : 'Daily totals from synced messages.'

    return (
        <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
                <div>
                    <h3 className="text-sm font-semibold text-black">{chartTitle}</h3>
                    <p className="mt-1 text-xs text-gray-600">{chartSubtitle}</p>
                </div>
                <div className="text-right">
                    <div className="text-sm font-semibold text-black">{fmt(total)}</div>
                    <div className="text-xs text-gray-500">{isHourly ? 'today' : 'messages'}</div>
                </div>
            </div>
            {loading ? (
                <div className="m-5 h-64 animate-pulse rounded-lg bg-[#f5f7fa]" />
            ) : timeline.length ? (
                <div className="p-5">
                    <div className="rounded-lg border border-gray-100 bg-[#fbfcfd] p-4">
                        <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
                            <span>{isHourly ? `${activePoints} active hours` : `${timeline.length} days`}</span>
                            <span>Peak {peak ? `${isHourly ? peak.hour : peak.date.slice(5)} · ${fmt(peak.total)}` : '-'}</span>
                        </div>
                        <div className="relative h-60">
                            <div className="absolute inset-x-0 top-0 border-t border-dashed border-gray-200" />
                            <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-gray-200" />
                            <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-gray-200" />
                            <div className="absolute inset-x-0 bottom-8 border-t border-gray-200" />

                            <div className="absolute inset-x-0 bottom-0 top-2 flex items-end justify-between gap-1.5 pb-8">
                                {timeline.map((point, index) => {
                                    const value = n(point.total)
                                    const height = value === 0 ? 0 : Math.max(8, (value / max) * 150)
                                    const label = isHourly ? point.hour : point.date?.slice(5)
                                    const showLabel = isHourly ? index % 4 === 0 : true
                                    return (
                                        <div key={isHourly ? point.hour : point.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                                            <div className="text-[11px] font-semibold text-gray-700 opacity-0 transition-opacity group-hover:opacity-100">
                                                {fmt(value)}
                                            </div>
                                            <div className="flex h-[150px] w-full max-w-8 items-end justify-center rounded bg-gray-100">
                                                <div
                                                    className="w-full rounded bg-[#0070d1] transition-all group-hover:bg-[#0064b7]"
                                                    style={{ height }}
                                                    title={`${label}: ${fmt(value)} messages`}
                                                />
                                            </div>
                                            <span className="h-4 w-12 truncate text-center text-[10px] text-gray-500">
                                                {showLabel ? label : ''}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <EmptyState icon={BarChart3} title="No trend data" text="Messages in this range will create the chart." compact />
            )}
        </div>
    )
}

function QualityCard({ model, rangeLabel }) {
    return (
        <div className="rounded-lg bg-black p-5 text-white">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-white/70">Delivery quality</p>
                    <p className="mt-2 text-[42px] font-light leading-none">{model.quality}<span className="text-xl text-white/45">/100</span></p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-[#53b1ff]" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
                <QualityStat label="Delivered" value={fmt(model.delivered)} />
                <QualityStat label="Read" value={fmt(model.read)} />
                <QualityStat label="Pending" value={fmt(model.pending)} />
                <QualityStat label="Failed" value={fmt(model.failed)} />
            </div>
            <p className="mt-6 text-sm leading-6 text-white/72">
                {model.totalMessages
                    ? `${pct(model.deliveryRate)} delivery and ${pct(model.readRate)} read rate for ${rangeLabel.toLowerCase()}.`
                    : `No message activity found for ${rangeLabel.toLowerCase()}.`}
            </p>
        </div>
    )
}

function QualityStat({ label, value }) {
    return (
        <div>
            <p className="text-xs font-medium uppercase text-white/45">{label}</p>
            <p className="mt-1 text-xl font-medium">{value}</p>
        </div>
    )
}

function RateCard({ label, value, count, color }) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">{label}</span>
                <span className="text-sm font-semibold text-black">{count}</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-gray-100">
                <div className={`h-1.5 rounded-full ${color}`} style={{ width: pct(value) }} />
            </div>
        </div>
    )
}

function HealthRow({ icon, label, value, active }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-lg bg-[#f5f7fa] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
                <span className={`rounded-lg p-2 ${active ? 'bg-white text-[#0064b7]' : 'bg-amber-50 text-amber-600'}`}>
                    {createElement(icon, { className: 'h-4 w-4' })}
                </span>
                <span className="truncate text-sm font-medium text-gray-700">{label}</span>
            </div>
            <span className="shrink-0 text-sm font-semibold text-black">{value}</span>
        </div>
    )
}

function MiniStat({ icon, label, value }) {
    return (
        <div className="rounded-lg bg-[#f5f7fa] p-4">
            <span className="mb-4 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-gray-600">
                {createElement(icon, { className: 'h-4 w-4' })}
            </span>
            <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-light text-black">{value}</p>
        </div>
    )
}

function InfoLine({ icon, label, value }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f5f7fa] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
                <span className="rounded-lg bg-white p-2 text-gray-600">{createElement(icon, { className: 'h-4 w-4' })}</span>
                <span className="truncate text-sm font-medium text-gray-700">{label}</span>
            </div>
            <span className="text-right text-sm font-semibold text-black">{value}</span>
        </div>
    )
}

function QuickAction({ to, icon, title, text, primary }) {
    return (
        <Link to={to} className={`group flex items-center gap-3 rounded-lg p-4 transition-colors ${primary ? 'border border-[#b9dcfb] bg-[#eef7ff] hover:bg-[#e2f2ff]' : 'bg-[#f5f7fa] hover:bg-gray-100'}`}>
            <span className={`rounded-lg bg-white p-2 ${primary ? 'text-[#0070d1] ring-1 ring-[#cfe5fb]' : 'text-[#0064b7]'}`}>{createElement(icon, { className: 'h-4 w-4' })}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-black">{title}</span>
                <span className="mt-0.5 block truncate text-xs text-gray-600">{text}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0064b7]" />
        </Link>
    )
}

function ActivityRow({ item }) {
    return (
        <div className="flex items-start gap-3 rounded-lg bg-[#f5f7fa] p-4">
            <span className="mt-0.5 rounded-lg bg-white p-2 text-[#0064b7]">
                <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-black">{item.title}</p>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600">{item.status}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-700">{item.description}</p>
                <p className="mt-2 text-xs text-gray-500">{item.meta}</p>
            </div>
        </div>
    )
}

function CampaignRow({ campaign }) {
    return (
        <div className="rounded-lg bg-[#f5f7fa] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-black">{campaign.name || 'Campaign'}</p>
                    <p className="mt-1 text-xs text-gray-500">{campaign.status || 'No status'}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600">
                    {fmt(campaign.total_contacts)} contacts
                </span>
            </div>
        </div>
    )
}

function EmptyState({ icon, title, text, compact }) {
    return (
        <div className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-[#f5f7fa] p-6 text-center ${compact ? 'min-h-40' : 'min-h-36'}`}>
            <div className="rounded-full bg-white p-3 text-gray-400">{createElement(icon, { className: 'h-5 w-5' })}</div>
            <p className="mt-3 text-sm font-semibold text-black">{title}</p>
            <p className="mt-1 max-w-sm text-sm text-gray-600">{text}</p>
        </div>
    )
}

function SkeletonRow() {
    return (
        <div className="rounded-lg bg-[#f5f7fa] p-4">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-gray-200" />
        </div>
    )
}

function StatusPill({ label, warning }) {
    return (
        <span className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${warning ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {label}
        </span>
    )
}
