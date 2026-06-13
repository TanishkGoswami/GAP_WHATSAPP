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
    Clock3,
    FileText,
    Gauge,
    Grid2X2,
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

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard icon={MessageSquareText} label="Messages" value={fmt(model.totalMessages)} detail={`${rangeLabel} synced`} loading={isLoading} />
                    <MetricCard icon={Users} label="Customer messages" value={fmt(model.metrics.inbound)} detail="Inbound activity" loading={isLoading} />
                    <MetricCard icon={Bot} label="AI + team replies" value={fmt(n(model.metrics.aiAgent) + n(model.metrics.humanAgent))} detail={`${fmt(model.metrics.aiAgent)} AI / ${fmt(model.metrics.humanAgent)} human`} loading={isLoading} />
                    <MetricCard icon={AlertTriangle} label="Failed delivery" value={`${model.failedRate.toFixed(1)}%`} detail={`${fmt(model.failed)} messages`} warning={model.failedRate > 5} loading={isLoading} />
                </section>

                <BillingOverviewStrip overview={billingOverview} />

                <section className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
                    <Panel
                        title="Message performance"
                        subtitle="Delivery, reads, and failures from real WhatsApp message rows."
                        action={<StatusPill label={healthLabel} warning={model.failedRate > 5} />}
                    >
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
                            <TrendChart timeline={range === 'today' ? model.hourlyTimeline : model.timeline} loading={isLoading} range={range} />
                            <QualityCard model={model} rangeLabel={rangeLabel} />
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <RateCard label="Delivery rate" value={model.deliveryRate} count={fmt(model.delivered)} color="bg-[#0070d1]" />
                            <RateCard label="Read rate" value={model.readRate} count={fmt(model.read)} color="bg-emerald-500" />
                            <RateCard label="Pending" value={model.totalMessages ? (model.pending / model.totalMessages) * 100 : 0} count={fmt(model.pending)} color="bg-amber-400" />
                            <RateCard label="Failure risk" value={model.failedRate} count={`${model.failedRate.toFixed(1)}%`} color="bg-red-500" />
                        </div>
                    </Panel>

                    <Panel title="System health" subtitle="Current account, inbox, and automation state." action={<Gauge className="h-4 w-4 text-gray-400" />}>
                        <div className="space-y-2.5">
                            <HealthRow icon={Smartphone} label="WhatsApp accounts" value={`${fmt(model.accounts.active)} active / ${fmt(model.accounts.total)} total`} active={n(model.accounts.active) > 0} />
                            <HealthRow icon={MessageSquareText} label="Conversations" value={fmt(model.conversations.total)} active />
                            <HealthRow icon={Bot} label="Bot active chats" value={fmt(model.conversations.botActive)} active />
                            <HealthRow icon={FileText} label="AI summaries ready" value={fmt(model.conversations.summariesReady)} active />
                            <HealthRow icon={AlertTriangle} label="Unread messages" value={fmt(model.conversations.unread)} active={n(model.conversations.unread) === 0} />
                        </div>
                    </Panel>
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
                <div className="relative border-b border-[#d9ecfd] bg-[#eef7ff] p-5 sm:p-6 lg:min-h-[260px] xl:border-b-0 xl:border-r">
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
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#0070d1] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0064b7]"
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
                    <img
                        src="/images/dashboad-scope.png"
                        alt="Dashboard scope preview"
                        className="pointer-events-none absolute bottom-5 right-8 hidden w-[260px] object-contain lg:block xl:w-[285px]"
                        loading="lazy"
                    />
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
                    {steps.map(step => (
                        <div key={step.title} className="rounded-lg border border-gray-200 bg-[#fbfcfd] p-4">
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#0064b7] ring-1 ring-gray-200">
                                {createElement(step.icon, { className: 'h-4 w-4' })}
                            </span>
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
                <div className="inline-flex rounded-full border border-gray-200 bg-white p-1">
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
        <div className="rounded-lg bg-[#f5f7fa] p-4">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-sm font-semibold text-black">{count}</span>
            </div>
            <div className="mt-4 h-1.5 rounded-full bg-white">
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
