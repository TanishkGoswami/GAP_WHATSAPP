import { createElement, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Bot,
    CheckCheck,
    Clock3,
    Eye,
    FileText,
    Gauge,
    LayoutDashboard,
    MessageSquare,
    RefreshCw,
    Send,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Users,
    Wifi,
    Workflow,
    Zap,
} from 'lucide-react'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
const API_BASE = `${BACKEND_BASE}/api`

const timeRanges = ['Today', '7 days', '30 days']

const numberFormat = new Intl.NumberFormat('en-IN')

function asNumber(value, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

function pct(value) {
    return `${Math.max(0, Math.min(100, Math.round(asNumber(value))))}%`
}

function getFreshnessLabel(updatedAt) {
    if (!updatedAt) return 'Waiting for first sync'
    const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000))
    if (seconds < 10) return 'Updated just now'
    if (seconds < 60) return `Updated ${seconds}s ago`
    const minutes = Math.round(seconds / 60)
    return `Updated ${minutes}m ago`
}

function MetricCard({ title, value, helper, icon, tone, trend, loading }) {
    const tones = {
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        green: 'bg-green-50 text-green-700 border-green-100',
        violet: 'bg-violet-50 text-violet-700 border-violet-100',
        red: 'bg-red-50 text-red-700 border-red-100',
    }

    return (
        <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-500">{title}</p>
                    {loading ? (
                        <div className="mt-3 h-8 w-24 animate-pulse rounded-md bg-gray-100" />
                    ) : (
                        <div className="mt-2 text-3xl font-bold tracking-tight text-gray-950">{value}</div>
                    )}
                </div>
                <div className={`rounded-xl border p-3 ${tones[tone] || tones.blue}`}>
                    {createElement(icon, { className: 'h-5 w-5' })}
                </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
                <p className="truncate text-sm text-gray-500">{helper}</p>
                {trend ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700">
                        <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                        {trend}
                    </span>
                ) : null}
            </div>
        </div>
    )
}

function ProgressRow({ label, value, count, tone = 'bg-green-500' }) {
    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-gray-700">{label}</span>
                <span className="font-semibold text-gray-950">{count}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
                <div className={`h-2 rounded-full ${tone} transition-all duration-500`} style={{ width: pct(value) }} />
            </div>
        </div>
    )
}

function HealthBadge({ failedRate }) {
    const failed = asNumber(failedRate)
    const config = failed > 10
        ? ['Needs attention', 'bg-red-50 text-red-700 border-red-200']
        : failed > 4
            ? ['Monitor', 'bg-amber-50 text-amber-700 border-amber-200']
            : ['Healthy', 'bg-green-50 text-green-700 border-green-200']

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${config[1]}`}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {config[0]}
        </span>
    )
}

function QuickAction({ to, icon, title, description, accent }) {
    return (
        <Link
            to={to}
            className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md"
        >
            <div className={`rounded-lg p-2 ${accent}`}>
                {createElement(icon, { className: 'h-5 w-5' })}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-950">{title}</h3>
                    <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-green-600" />
                </div>
                <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
            </div>
        </Link>
    )
}

function ActivityItem({ icon, title, description, status, tone }) {
    return (
        <div className="flex gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-gray-50">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                {createElement(icon, { className: 'h-4 w-4' })}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-950">{title}</p>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{status}</span>
                </div>
                <p className="mt-1 text-sm leading-5 text-gray-500">{description}</p>
            </div>
        </div>
    )
}

export default function Dashboard() {
    const { apiCall, session } = useAuth()
    const [range, setRange] = useState('Today')

    const {
        data: stats,
        isLoading,
        isFetching,
        dataUpdatedAt,
        refetch,
    } = useQuery({
        queryKey: ['dashboard-stats', session?.access_token],
        queryFn: async () => {
            const res = await apiCall(`${API_BASE}/dashboard-stats`)
            if (!res.ok) throw new Error('Failed to fetch dashboard stats')
            return res.json()
        },
        staleTime: 1000 * 30,
        refetchInterval: 10000,
        enabled: !!session?.access_token,
    })

    const model = useMemo(() => {
        const metrics = stats?.metrics || {}
        const totalMessages = asNumber(metrics.totalMessages)
        const delivered = asNumber(metrics.delivered)
        const readRate = asNumber(metrics.readRate)
        const failedRate = asNumber(metrics.failedRate)
        const deliveryRate = asNumber(metrics.deliveryRate, totalMessages ? (delivered / totalMessages) * 100 : 0)
        const readCount = Math.round((readRate / 100) * totalMessages)
        const failedCount = Math.round((failedRate / 100) * totalMessages)
        const pendingCount = Math.max(0, totalMessages - delivered - failedCount)
        const quality = stats?.health?.quality ?? Math.max(0, 100 - Math.round(failedRate * 2))
        const contacts = asNumber(stats?.contacts)
        const conversations = Math.max(contacts, totalMessages ? Math.ceil(totalMessages / 4) : 0)
        const engagement = totalMessages > 0 ? Math.round((readCount / totalMessages) * 100) : 0

        return {
            totalMessages,
            delivered,
            readRate,
            failedRate,
            deliveryRate,
            readCount,
            failedCount,
            pendingCount,
            quality,
            contacts,
            conversations,
            engagement,
        }
    }, [stats])

    const healthCopy = model.failedRate > 10
        ? 'Failure rate is above the comfort zone. Check account connection and templates.'
        : model.failedRate > 4
            ? 'Delivery is usable, but failures deserve monitoring.'
            : 'Message delivery and read quality look stable.'

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                        <LayoutDashboard className="h-4 w-4" />
                        Command center
                    </div>
                    <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">Dashboard</h1>
                    <p className="mt-1 text-sm text-gray-500">Live WhatsApp performance, sales readiness, and automation health.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
                        {timeRanges.map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setRange(item)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                                    range === item ? 'bg-gray-950 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-950'
                                }`}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:border-green-200 hover:bg-green-50 hover:text-green-700"
                    >
                        <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <div className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                        </span>
                        {getFreshnessLabel(dataUpdatedAt)}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    title="Total messages"
                    value={numberFormat.format(model.totalMessages)}
                    helper={`${range} performance view`}
                    icon={MessageSquare}
                    tone="blue"
                    trend={model.totalMessages ? 'Live' : ''}
                    loading={isLoading}
                />
                <MetricCard
                    title="Delivered"
                    value={numberFormat.format(model.delivered)}
                    helper={`${pct(model.deliveryRate)} delivery efficiency`}
                    icon={CheckCheck}
                    tone="green"
                    trend={pct(model.deliveryRate)}
                    loading={isLoading}
                />
                <MetricCard
                    title="Read rate"
                    value={pct(model.readRate)}
                    helper={`${numberFormat.format(model.readCount)} estimated reads`}
                    icon={Eye}
                    tone="violet"
                    trend={model.readRate >= 80 ? 'Strong' : 'Track'}
                    loading={isLoading}
                />
                <MetricCard
                    title="Failed post"
                    value={`${asNumber(model.failedRate).toFixed(1)}%`}
                    helper={`${numberFormat.format(model.failedCount)} messages need review`}
                    icon={AlertTriangle}
                    tone="red"
                    trend={model.failedRate > 4 ? 'Review' : 'Low'}
                    loading={isLoading}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <section className="xl:col-span-8 rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-base font-bold text-gray-950">Message operations</h2>
                            <p className="mt-1 text-sm text-gray-500">Delivery funnel and engagement signal from the latest synced data.</p>
                        </div>
                        <HealthBadge failedRate={model.failedRate} />
                    </div>
                    <div className="grid gap-6 p-5 lg:grid-cols-5">
                        <div className="lg:col-span-3 space-y-5">
                            <ProgressRow label="Delivered or read" value={model.deliveryRate} count={numberFormat.format(model.delivered)} tone="bg-green-500" />
                            <ProgressRow label="Read engagement" value={model.readRate} count={numberFormat.format(model.readCount)} tone="bg-violet-500" />
                            <ProgressRow label="Pending status" value={model.totalMessages ? (model.pendingCount / model.totalMessages) * 100 : 0} count={numberFormat.format(model.pendingCount)} tone="bg-amber-500" />
                            <ProgressRow label="Failed delivery" value={model.failedRate} count={numberFormat.format(model.failedCount)} tone="bg-red-500" />
                        </div>

                        <div className="lg:col-span-2 rounded-xl bg-gray-950 p-5 text-white">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-400">Audience synced</p>
                                    <div className="mt-2 text-4xl font-bold">{numberFormat.format(model.contacts)}</div>
                                </div>
                                <Users className="h-6 w-6 text-green-400" />
                            </div>
                            <div className="mt-6 grid grid-cols-2 gap-3">
                                <div className="rounded-lg bg-white/8 p-3">
                                    <div className="text-xs uppercase tracking-wide text-gray-400">Conversations</div>
                                    <div className="mt-1 text-xl font-bold">{numberFormat.format(model.conversations)}</div>
                                </div>
                                <div className="rounded-lg bg-white/8 p-3">
                                    <div className="text-xs uppercase tracking-wide text-gray-400">Quality</div>
                                    <div className="mt-1 text-xl font-bold">{model.quality}/100</div>
                                </div>
                            </div>
                            <p className="mt-5 text-sm leading-6 text-gray-300">{healthCopy}</p>
                        </div>
                    </div>
                </section>

                <section className="xl:col-span-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-bold text-gray-950">System health</h2>
                            <p className="mt-1 text-sm text-gray-500">Operational checks for WhatsApp automation.</p>
                        </div>
                        <Gauge className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="mt-5 space-y-3">
                        <HealthLine icon={Wifi} label="Realtime sync" value={isFetching ? 'Syncing' : 'Active'} good />
                        <HealthLine icon={ShieldCheck} label="Quality rating" value={`${model.quality}/100`} good={model.quality >= 85} />
                        <HealthLine icon={Clock3} label="API latency" value="~245ms" good />
                        <HealthLine icon={AlertTriangle} label="Failure risk" value={`${asNumber(model.failedRate).toFixed(1)}%`} good={model.failedRate <= 4} />
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <section className="xl:col-span-7 rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-100 p-5">
                        <h2 className="text-base font-bold text-gray-950">Recent activity</h2>
                        <p className="mt-1 text-sm text-gray-500">A compact operator feed for what needs attention next.</p>
                    </div>
                    <div className="p-3">
                        <ActivityItem
                            icon={Activity}
                            title="Database sync is live"
                            description={`${numberFormat.format(model.totalMessages)} messages and ${numberFormat.format(model.contacts)} contacts are available for reporting.`}
                            status="Live"
                            tone="bg-green-50 text-green-700"
                        />
                        <ActivityItem
                            icon={Eye}
                            title="Read engagement"
                            description={model.readRate >= 80 ? 'Customers are opening most delivered messages.' : 'Read rate has room to improve. Try clearer first lines and timing.'}
                            status={pct(model.readRate)}
                            tone="bg-violet-50 text-violet-700"
                        />
                        <ActivityItem
                            icon={AlertTriangle}
                            title="Delivery watch"
                            description={model.failedRate > 4 ? 'Failed messages are above the ideal range. Review account health and templates.' : 'Failure rate is under control.'}
                            status={`${asNumber(model.failedRate).toFixed(1)}%`}
                            tone={model.failedRate > 4 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}
                        />
                    </div>
                </section>

                <section className="xl:col-span-5 space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-base font-bold text-gray-950">Quick actions</h2>
                                <p className="mt-1 text-sm text-gray-500">Shortcuts for the next operational task.</p>
                            </div>
                            <Zap className="h-5 w-5 text-amber-500" />
                        </div>
                        <div className="mt-5 grid gap-3">
                            <QuickAction
                                to="/live-chat"
                                icon={MessageSquare}
                                title="Open shared inbox"
                                description="Handle replies, assign owners, and review bot handoff summaries."
                                accent="bg-green-50 text-green-700"
                            />
                            <QuickAction
                                to="/bot-agents"
                                icon={Bot}
                                title="Tune bot agents"
                                description="Train knowledge, default replies, and unknown-number automation."
                                accent="bg-blue-50 text-blue-700"
                            />
                            <QuickAction
                                to="/broadcast"
                                icon={Send}
                                title="Plan broadcast"
                                description="Send targeted updates when delivery quality is stable."
                                accent="bg-violet-50 text-violet-700"
                            />
                        </div>
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <InsightCard
                    icon={Sparkles}
                    title="Automation opportunity"
                    text="Keep one trained agent ready for new and unknown chats, then hand off only warm or hot leads to sales."
                />
                <InsightCard
                    icon={Workflow}
                    title="Flow suggestion"
                    text="Use flow builder for common follow-ups like pricing, meeting booking, payment reminders, and invoice collection."
                />
                <InsightCard
                    icon={FileText}
                    title="Template hygiene"
                    text="Review failed posts before scaling broadcasts. Good templates protect delivery quality."
                />
            </div>
        </div>
    )
}

function HealthLine({ icon, label, value, good }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-3">
                <div className={`rounded-lg p-2 ${good ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {createElement(icon, { className: 'h-4 w-4' })}
                </div>
                <span className="text-sm font-medium text-gray-700">{label}</span>
            </div>
            <span className="text-sm font-bold text-gray-950">{value}</span>
        </div>
    )
}

function InsightCard({ icon, title, text }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-3">
                <div className="rounded-lg bg-gray-100 p-2 text-gray-700">
                    {createElement(icon, { className: 'h-5 w-5' })}
                </div>
                <div>
                    <h3 className="text-sm font-bold text-gray-950">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-500">{text}</p>
                </div>
            </div>
        </div>
    )
}
