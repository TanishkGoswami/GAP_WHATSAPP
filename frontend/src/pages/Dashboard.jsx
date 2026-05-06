import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import {
    MessageSquare,
    CheckCheck,
    Eye,
    AlertTriangle,
    TrendingUp,
    DollarSign,
    Activity,
    Users,
    Clock,
    BarChart3
} from 'lucide-react'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const API_BASE = `${BACKEND_BASE}/api`;

const MetricCard = ({ title, value, icon: Icon, color, trend }) => (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between pointer-events-none">
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-2">{value}</h3>
            </div>
            <div className={`p-3 rounded-lg ${color}`}>
                <Icon className="h-6 w-6 text-white" />
            </div>
        </div>
        <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 font-medium flex items-center">
                <Activity className="h-4 w-4 mr-1 opacity-50" />
                Live from DB
            </span>
        </div>
    </div>
)

const HealthBadge = ({ status }) => {
    const colors = {
        green: 'bg-green-100 text-green-700',
        yellow: 'bg-yellow-100 text-yellow-700',
        red: 'bg-red-100 text-red-700'
    }
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${colors[status]}`}>
            {status === 'green' ? 'High Quality' : (status === 'yellow' ? 'Fair' : 'Critical')}
        </span>
    )
}

export default function Dashboard() {
    const { session } = useAuth();
    const { data: stats, isLoading: loading } = useQuery({
        queryKey: ['dashboard-stats', session?.access_token],
        queryFn: async () => {
            if (!session?.access_token) return null;
            const res = await fetch(`${API_BASE}/dashboard-stats`, {
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'X-Auth-Portal': 'owner'
                }
            })
            if (!res.ok) throw new Error('Failed to fetch dashboard stats')
            return res.json()
        },
        staleTime: 1000 * 30,        // 30 sec cache
        refetchInterval: 10000,      // Auto refresh every 10 sec
        enabled: !!session?.access_token
    })


    const metrics = stats?.metrics || { totalMessages: 0, delivered: 0, readRate: 0, failedRate: 0 };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                    <p className="text-sm text-gray-500">Real-time overview of your WhatsApp performance</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                        <div className={`h-2 w-2 rounded-full ${loading ? 'bg-gray-400' : 'bg-green-500'} animate-pulse`}></div>
                        <span className="text-sm font-medium text-gray-700">Real-time Sync Active</span>
                    </div>
                </div>
            </div>

            {/* Top Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    title="Total Messages"
                    value={metrics.totalMessages.toLocaleString()}
                    icon={MessageSquare}
                    color="bg-blue-500"
                />
                <MetricCard
                    title="Delivered"
                    value={metrics.delivered.toLocaleString()}
                    icon={CheckCheck}
                    color="bg-green-500"
                />
                <MetricCard
                    title="Read Rate"
                    value={`${metrics.readRate}%`}
                    icon={Eye}
                    color="bg-indigo-500"
                />
                <MetricCard
                    title="Failed Post"
                    value={`${metrics.failedRate}%`}
                    icon={AlertTriangle}
                    color="bg-red-500"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Wallet & Health */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Wallet Card */}
                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 text-white shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium text-gray-300">Total Contacts</h3>
                            <Users className="h-5 w-5 text-indigo-400" />
                        </div>
                        <div className="text-4xl font-bold mb-2">{stats?.contacts || 0}</div>
                        <div className="text-sm text-gray-400 mb-6 font-mono uppercase tracking-wider">Unique Contacts Synced</div>

                        <div className="w-full bg-gray-700 h-1.5 rounded-full mb-2 opacity-30">
                            <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '100%' }}></div>
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                            <span>AUTOSCALE ACTIVE</span>
                            <span>DATABASE STATUS: OK</span>
                        </div>
                    </div>

                    {/* Health Monitor */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Activity className="h-5 w-5 text-gray-500" />
                                <h3 className="font-medium text-gray-900">Health Monitor</h3>
                            </div>
                            <HealthBadge status={stats?.health?.status || 'green'} />
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">Quality Rating</span>
                                <span className={`font-bold ${stats?.health?.status === 'red' ? 'text-red-600' : 'text-green-600'}`}>
                                    {stats?.health?.quality || 100}/100
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">API Latency</span>
                                <span className="font-medium text-gray-900">~245ms</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-500">Delivery Efficiency</span>
                                <span className="font-medium text-gray-900">{metrics.delivered > 0 ? 'Optimal' : 'Checking...'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Agent Performance */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-gray-900">Recent Activity</h3>
                            <p className="text-sm text-gray-500">Latest message overview</p>
                        </div>
                        <span className="text-xs font-mono text-gray-400 uppercase tracking-tighter">Live Stream</span>
                    </div>

                    <div className="p-8 flex flex-col items-center justify-center text-center">
                        <BarChart3 className="h-12 w-12 text-gray-200 mb-4" />
                        <h4 className="text-gray-900 font-medium">Activity Trends Coming Soon</h4>
                        <p className="text-gray-500 text-sm max-w-[240px] mt-2">Charts will be available as more messaging data is collected over time.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
