import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, Filter, MoreHorizontal, FileText, CheckCircle, Clock, XCircle, Image as ImageIcon, Video, Trash2, Link as LinkIcon, Phone, AlertCircle, RefreshCw, UploadCloud, Type, MessageSquareText, MousePointerClick, ChevronDown, Loader2, Check, MessageSquare, Image, ExternalLink, ArrowRight } from 'lucide-react'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { useDialog } from '../context/DialogContext'
import TourButton from '../onboarding/TourButton'

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const formatDateToIST = (dateStr) => {
    if (!dateStr) return 'recently';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        const formatter = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'Asia/Kolkata'
        });
        return formatter.format(date) + ' IST';
    } catch (e) {
        return dateStr;
    }
};



const INDUSTRY_LIBRARY = [
    {
        id: 'ind-re-1',
        industry: 'Real Estate',
        name: 'property_visit_schedule',
        category: 'MARKETING',
        language: 'en_US',
        components: [
            { type: 'HEADER', format: 'TEXT', text: 'Property Viewing' },
            {
                type: 'BODY',
                text: 'Hi {{1}},\n\nThank you for your interest in *{{2}}*. We would be glad to host you for a site viewing.\n\nOur agent, {{3}}, is available to show you around the amenities. Please click below to confirm your visit time or call us for details.',
                example: { body_text: [["John", "Skyline Apartments", "Sarah"]] }
            },
            { type: 'FOOTER', text: 'GAP Real Estate Group' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'View Brochure', url: 'https://example.com/brochure' },
                    { type: 'PHONE_NUMBER', text: 'Call Agent', phone_number: '+16505551234' }
                ]
            }
        ]
    },
    {
        id: 'ind-re-2',
        industry: 'Real Estate',
        name: 'payment_installment_reminder',
        category: 'UTILITY',
        language: 'en_US',
        components: [
            {
                type: 'BODY',
                text: 'Hello {{1}},\n\nThis is a friendly reminder that the next installment of {{2}} for your unit at *{{3}}* is due on {{4}}.\n\nYou can pay online using the secure link below to avoid any late payment charges.',
                example: { body_text: [["Michael", "$5,000", "Oceanview Villa", "Oct 15, 2026"]] }
            },
            { type: 'FOOTER', text: 'GAP Real Estate Group' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'Pay Online', url: 'https://example.com/pay' },
                    { type: 'PHONE_NUMBER', text: 'Contact Accounts', phone_number: '+16505551234' }
                ]
            }
        ]
    },
    {
        id: 'ind-ec-1',
        industry: 'E-commerce',
        name: 'cart_recovery_offer',
        category: 'MARKETING',
        language: 'en_US',
        components: [
            { type: 'HEADER', format: 'IMAGE', example: { header_handle: ["placeholder_handle"] } },
            {
                type: 'BODY',
                text: 'Hi {{1}},\n\nWe noticed you left a few items in your cart.\n\nYou can complete your order using the link below and apply code *SAVE10* to receive 10% off your purchase.',
                example: { body_text: [["Alice"]] }
            },
            { type: 'FOOTER', text: 'GAP Store' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'View Cart', url: 'https://example.com/checkout' },
                    { type: 'PHONE_NUMBER', text: 'Support', phone_number: '+16505551234' }
                ]
            }
        ]
    },
    {
        id: 'ind-ec-2',
        industry: 'E-commerce',
        name: 'order_delivery_update',
        category: 'UTILITY',
        language: 'en_US',
        components: [
            {
                type: 'BODY',
                text: 'Hi {{1}},\n\nYour order *#{{2}}* has been packed and handed over to our delivery partner. It is expected to be delivered by {{3}}.\n\nTrack the progress of your order in real-time below.',
                example: { body_text: [["Alice", "ORD-98765", "Tomorrow, 5 PM"]] }
            },
            { type: 'FOOTER', text: 'GAP Store Delivery' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'Track Shipment', url: 'https://example.com/track' }
                ]
            }
        ]
    },
    {
        id: 'ind-hc-1',
        industry: 'Healthcare',
        name: 'clinic_appointment_confirm',
        category: 'UTILITY',
        language: 'en_US',
        components: [
            { type: 'HEADER', format: 'TEXT', text: 'Appointment Confirmed' },
            {
                type: 'BODY',
                text: 'Dear {{1}},\n\nYour consultation with *Dr. {{2}}* has been confirmed for {{3}} at {{4}}.\n\nClinic Location: {{5}}.\nPlease arrive 10 minutes prior to your slot.',
                example: { body_text: [["David", "Smith", "Oct 12", "10:30 AM", "Main St. Clinic"]] }
            },
            { type: 'FOOTER', text: 'GAP Care Clinic' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'Get Directions', url: 'https://maps.google.com' },
                    { type: 'PHONE_NUMBER', text: 'Call Desk', phone_number: '+16505551234' }
                ]
            }
        ]
    },
    {
        id: 'ind-hc-2',
        industry: 'Healthcare',
        name: 'medical_report_ready',
        category: 'UTILITY',
        language: 'en_US',
        components: [
            {
                type: 'BODY',
                text: 'Hello {{1}},\n\nYour lab reports for test *{{2}}* conducted on {{3}} are ready.\n\nYou can access your password-secured PDF report by clicking the link below.',
                example: { body_text: [["David", "Blood Test", "Oct 10"]] }
            },
            { type: 'FOOTER', text: 'GAP Care Clinic' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'Download Report', url: 'https://example.com/reports' }
                ]
            }
        ]
    },
    {
        id: 'ind-ed-1',
        industry: 'Education',
        name: 'webinar_live_invite',
        category: 'MARKETING',
        language: 'en_US',
        components: [
            { type: 'HEADER', format: 'IMAGE', example: { header_handle: ["placeholder_handle"] } },
            {
                type: 'BODY',
                text: 'Hello {{1}},\n\nAdmissions are now open for the *{{2}}* masterclass.\n\nLearn directly from industry experts and earn your certification. Join our live session on {{3}} at {{4}} EST.',
                example: { body_text: [["Emma", "Digital Marketing", "Nov 5", "2:00 PM"]] }
            },
            { type: 'FOOTER', text: 'GAP Learning Institute' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'Register Now', url: 'https://example.com/webinar' }
                ]
            }
        ]
    },
    {
        id: 'ind-fn-1',
        industry: 'Finance',
        name: 'invoice_payment_receipt',
        category: 'UTILITY',
        language: 'en_US',
        components: [
            {
                type: 'BODY',
                text: 'Hello {{1}},\n\nWe have successfully received your payment of *{{2}}* for invoice *#{{3}}*.\n\nThank you for using our secure payment gateway. Your receipt is attached via the link below.',
                example: { body_text: [["Robert", "$150.00", "INV-12345"]] }
            },
            { type: 'FOOTER', text: 'GAP Finance Services' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'Download Invoice', url: 'https://example.com/receipts' }
                ]
            }
        ]
    }
];

export default function Templates({ defaultView = 'MY_TEMPLATES' }) {
    const { session, apiCall } = useAuth();
    const { alertDialog, confirmDialog } = useDialog();
    const [viewMode, setViewMode] = useState(defaultView);
    const [iscreateOpen, setIsCreateOpen] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState(null)
    const [activeTab, setActiveTab] = useState('ALL') // ALL, MARKETING, UTILITY, AUTHENTICATION
    const [activeStatus, setActiveStatus] = useState('APPROVED') // APPROVED, PENDING, DRAFT
    const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
    const [templates, setTemplates] = useState([])
    const [loading, setLoading] = useState(true)
    const [fetchError, setFetchError] = useState('')

    // Prefill state
    const [prefilledTemplate, setPrefilledTemplate] = useState(null);

    // Industry library filter state
    const [activeIndustry, setActiveIndustry] = useState('All Industries')
    const [libraryCategory, setLibraryCategory] = useState('ALL')
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        setViewMode(defaultView);
    }, [defaultView]);

    // Compute unified templates list
    const allTemplatesList = useMemo(() => {
        return templates;
    }, [templates]);

    // Compute status counts for indicators
    const approvedCount = useMemo(() => {
        return allTemplatesList.filter(t => t.status === 'APPROVED').length;
    }, [allTemplatesList]);

    const pendingCount = useMemo(() => {
        return allTemplatesList.filter(t => t.status === 'PENDING').length;
    }, [allTemplatesList]);

    const draftCount = useMemo(() => {
        return allTemplatesList.filter(t => t.status === 'DRAFT' || t.status === 'REJECTED').length;
    }, [allTemplatesList]);

    // Compute filtered list based on dropdown and status tabs
    const filteredTemplates = useMemo(() => {
        return allTemplatesList.filter(t => {
            const matchCategory = activeTab === 'ALL' || t.category === activeTab;

            let matchStatus = false;
            if (activeStatus === 'APPROVED') {
                matchStatus = t.status === 'APPROVED';
            } else if (activeStatus === 'PENDING') {
                matchStatus = t.status === 'PENDING';
            } else if (activeStatus === 'DRAFT') {
                // Draft view includes DRAFT or REJECTED templates
                matchStatus = t.status === 'DRAFT' || t.status === 'REJECTED';
            }

            return matchCategory && matchStatus;
        });
    }, [allTemplatesList, activeTab, activeStatus]);

    const fetchData = async () => {
        setLoading(true)
        setFetchError('')
        try {
            // Fetch templates
            const tplRes = await apiCall(`${API_URL}/api/whatsapp/templates`);
            const tplData = await tplRes.json();
            if (tplRes.ok) {
                setTemplates(tplData || []);
            } else {
                console.error('Error validating access token:', tplData.error);
                setFetchError(tplData.error || 'Could not load templates from Meta.')
            }
        } catch (error) {
            console.error('Error fetching data:', error);
            setFetchError(error?.message || 'Could not load templates.')
        } finally {
            setLoading(false);
        }
    }

    const handleCreateSuccess = () => {
        fetchData();
        setViewMode('MY_TEMPLATES');
        setActiveStatus('PENDING');
    };

    // When user clicks "+ Add to My Templates" on any industry library template:
    // → Always open the CreateTemplateModal pre-filled with the template data
    // → User reviews, customizes, uploads their own media if needed
    // → User clicks "Submit for Review" to send to Meta for approval
    // This way the user is always in control — nothing gets submitted without their explicit action.
    const handleAddToMyTemplates = (item) => {
        setSelectedTemplate(null); // close preview modal if open
        setPrefilledTemplate(item);
        setIsCreateOpen(true);
    };


    useEffect(() => {
        if (session?.access_token) {
            fetchData();
        }
    }, [session])

    const handleDelete = async (name) => {
        const confirmed = await confirmDialog(`Are you sure you want to delete template "${name}"?`, {
            title: 'Delete template',
            tone: 'danger',
            confirmLabel: 'Delete template',
        });
        if (!confirmed) return;
        try {
            const res = await apiCall(`${API_URL}/api/whatsapp/templates/${name}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchData();
            } else {
                const data = await res.json();
                alertDialog(data.error || 'Failed to delete template', { title: 'Delete failed', tone: 'danger' });
            }
        } catch (error) {
            console.error(error);
        }
    }

    const filteredLibrary = useMemo(() => {
        return INDUSTRY_LIBRARY.filter(t => {
            const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.components.find(c => c.type === 'BODY')?.text.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesIndustry = activeIndustry === 'All Industries' || t.industry === activeIndustry;
            const matchesCategory = libraryCategory === 'ALL' || t.category === libraryCategory;

            return matchesSearch && matchesIndustry && matchesCategory;
        });
    }, [searchQuery, activeIndustry, libraryCategory]);

    // Grouping by Industry for "All Industries" view
    const groupedLibrary = useMemo(() => {
        const groups = {};
        filteredLibrary.forEach(item => {
            if (!groups[item.industry]) {
                groups[item.industry] = [];
            }
            groups[item.industry].push(item);
        });
        return groups;
    }, [filteredLibrary]);

    if (viewMode === 'INDUSTRIES') {
        // Industry metadata: icons, colors, emoji
        const industryMeta = {
            'Real Estate': { emoji: '🏠', color: 'amber', from: 'from-amber-500', to: 'to-orange-500', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
            'E-commerce': { emoji: '🛍️', color: 'blue', from: 'from-blue-500', to: 'to-cyan-500', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
            'Healthcare': { emoji: '🏥', color: 'green', from: 'from-emerald-500', to: 'to-teal-500', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
            'Education': { emoji: '🎓', color: 'indigo', from: 'from-indigo-500', to: 'to-violet-500', light: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
            'Finance': { emoji: '💳', color: 'purple', from: 'from-purple-500', to: 'to-pink-500', light: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
        };
        const categoryColors = {
            MARKETING: 'bg-white text-gray-700 border-gray-300',
            UTILITY: 'bg-white text-gray-700 border-gray-300',
            AUTHENTICATION: 'bg-white text-gray-700 border-gray-300',
        };
        const categoryOptions = [
            { label: 'All categories', value: 'ALL', count: INDUSTRY_LIBRARY.length },
            { label: 'Marketing', value: 'MARKETING', count: INDUSTRY_LIBRARY.filter(t => t.category === 'MARKETING').length },
            { label: 'Utility', value: 'UTILITY', count: INDUSTRY_LIBRARY.filter(t => t.category === 'UTILITY').length },
            { label: 'Authentication', value: 'AUTHENTICATION', count: INDUSTRY_LIBRARY.filter(t => t.category === 'AUTHENTICATION').length },
        ];

        return (
            <div className="min-h-[calc(100vh-4rem)] bg-[#eef4f7] pb-10">
                <div className="sticky top-0 z-20 border-b border-gray-200 bg-white px-4 py-2 shadow-sm">
                    <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                            <input
                                data-tour="templates-library-search"
                                type="text"
                                placeholder="Search template library"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 w-full rounded border border-gray-300 bg-white pl-10 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-[#1877f2] focus:ring-1 focus:ring-[#1877f2]"
                            />
                        </div>
                        <div className="inline-flex h-9 items-center rounded border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 shadow-sm md:w-56">
                            English (US) templates
                        </div>
                    </div>
                </div>
                {/* ═══════════════════════════════════════════════════════════════
                    HERO BANNER — Dark navy theme matching Recharge Wallet card
                ═══════════════════════════════════════════════════════════════ */}
                <div className="hidden" style={{ background: 'linear-gradient(135deg, #0f1129 0%, #161a3a 50%, #121530 100%)' }}>
                    {/* Ambient glow effects */}
                    <div className="absolute -left-20 -top-20 w-72 h-72 bg-indigo-500/[0.07] blur-[80px] rounded-full pointer-events-none" />
                    <div className="absolute right-0 bottom-0 w-48 h-48 bg-purple-500/[0.05] blur-[60px] rounded-full pointer-events-none" />
                    
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                        {/* Left — Icon + Text */}
                        <div className="flex items-center gap-4">
                            <div className="shrink-0 flex items-center justify-center w-[52px] h-[52px] rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 shadow-lg shadow-indigo-500/20">
                                <FileText className="h-6 w-6 text-white" strokeWidth={2} />
                            </div>
                            <div>
                                <h1 className="text-[19px] font-bold text-white tracking-tight">Template Library</h1>
                                <p className="text-[13px] text-[#7c819b] mt-1 leading-relaxed max-w-md">
                                    Browse {filteredLibrary.length}+ professionally crafted WhatsApp message templates.<br className="hidden sm:inline" />
                                    Customize and submit for Meta approval in minutes.
                                </p>
                            </div>
                        </div>

                        {/* Right — Quick-filter pills */}
                        <div className="flex flex-wrap items-center gap-2.5">
                            {[
                                { label: 'Marketing', icon: <MessageSquareText className="h-3.5 w-3.5" />, color: 'text-sky-400' },
                                { label: 'Utility', icon: <Clock className="h-3.5 w-3.5" />, color: 'text-amber-400' },
                                { label: 'Auth', icon: <CheckCircle className="h-3.5 w-3.5" />, color: 'text-violet-400' },
                            ].map(pill => (
                                <span key={pill.label} className="inline-flex items-center gap-2 bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-lg px-4 py-2 text-[12px] font-medium text-white/70 select-none hover:bg-white/[0.08] hover:text-white transition-all duration-200 cursor-default">
                                    <span className={pill.color}>{pill.icon}</span>
                                    {pill.label}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════
                    CONTENT — Sidebar + Template Cards
                ═══════════════════════════════════════════════════════════════ */}
                <div className="flex w-full flex-col items-start gap-5 md:flex-row">

                    {/* ── Left Sidebar ────────────────────────────────── */}
                    <div className="w-full shrink-0 md:sticky md:top-[53px] md:w-[220px] lg:w-[236px] xl:w-[252px]">
                        <div className="overflow-hidden border-b border-r border-gray-200 bg-white shadow-sm lg:border-b-0">
                            {/* Search */}
                            <div className="hidden">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Search templates..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50/80 pl-9 pr-3 py-2 text-xs placeholder:text-gray-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none focus:bg-white transition-all"
                                    />
                                </div>
                            </div>

                            <div className="border-b border-gray-200 px-3.5 py-4">
                                <p className="mb-3 text-sm font-semibold text-gray-900">Category</p>
                                <div className="space-y-2">
                                    {categoryOptions.map(option => {
                                        const selected = libraryCategory === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setLibraryCategory(option.value)}
                                                className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left text-sm text-gray-900 hover:bg-gray-50"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <span className={`flex h-5 w-5 items-center justify-center rounded-full border bg-white ${selected ? 'border-[#1877f2]' : 'border-gray-300'}`}>
                                                        {selected && <span className="h-3 w-3 rounded-full bg-[#1877f2]" />}
                                                    </span>
                                                    {option.label}
                                                </span>
                                                <span className="text-xs text-gray-500">({option.count})</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Industry List */}
                            <div className="border-b border-gray-200 px-3.5 py-4">
                                <p className="mb-3 text-sm font-semibold text-gray-900">Industry</p>
                                {[
                                    { label: 'All Industries', icon: '⚡', count: INDUSTRY_LIBRARY.length },
                                    ...Object.keys(industryMeta).map(name => ({
                                        label: name,
                                        icon: industryMeta[name].emoji,
                                        count: INDUSTRY_LIBRARY.filter(t => t.industry === name).length
                                    }))
                                ].map((ind) => {
                                    const isSelected = activeIndustry === ind.label;
                                    return (
                                        <button
                                            key={ind.label}
                                            type="button"
                                            onClick={() => setActiveIndustry(ind.label)}
                                            className={`mb-1 flex w-full items-center justify-between rounded px-2 py-2 text-sm transition-colors ${isSelected
                                                ? 'bg-gray-100 font-semibold text-gray-950'
                                                : 'text-gray-700 hover:bg-gray-50'
                                                }`}
                                        >
                                            <span className="flex items-center gap-2.5">
                                                <span className="hidden">{ind.icon}</span>
                                                {ind.label}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {ind.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Footer note */}
                            <div className="px-3.5 py-4">
                                <p className="mb-2 text-sm font-semibold text-gray-900">Approval tips</p>
                                <ul className="space-y-2 text-[11px] leading-5 text-gray-600">
                                    <li>Use Utility only for transactional updates, not offers.</li>
                                    <li>Keep variables clear: explain what each placeholder value means.</li>
                                    <li>Avoid misleading urgency, spam words, or all-caps claims.</li>
                                    <li>Use valid URLs and phone numbers in buttons.</li>
                                    <li>Match the category with the real message purpose.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* ── Right — Template Cards ──────────────────────── */}
                    <div className="min-w-0 flex-1 px-4 py-6 md:pl-0 lg:pr-6">
                        {filteredLibrary.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded border border-dashed border-gray-300 bg-white py-20 text-center">
                                <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl mb-3">🔍</div>
                                <h3 className="text-sm font-bold text-gray-900">No matching templates</h3>
                                <p className="text-xs text-gray-500 mt-1">Try different keywords or select another vertical.</p>
                            </div>
                        ) : (
                            <div className="space-y-10">
                                {Object.keys(groupedLibrary).map(industryName => {
                                    return (
                                        <div key={industryName}>
                                            {/* Industry section header */}
                                            <div className="mb-5 flex items-center gap-3">
                                                <div className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white">
                                                    <FileText className="h-4 w-4 text-gray-600" />
                                                </div>
                                                <div>
                                                    <h2 className="text-base font-bold text-gray-900">{industryName}</h2>
                                                    <p className="text-xs text-gray-400">{groupedLibrary[industryName].length} templates</p>
                                                </div>
                                                <div className="ml-auto h-px flex-1 bg-gray-300" />
                                            </div>

                                            {/* Cards grid */}
                                            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[repeat(3,minmax(0,330px))]">
                                                {groupedLibrary[industryName].map((item) => {
                                                    const bodyComp = item.components.find(c => c.type === 'BODY');
                                                    const buttonsComp = item.components.find(c => c.type === 'BUTTONS');
                                                    const headerComp = item.components.find(c => c.type === 'HEADER');
                                                    const catStyle = categoryColors[item.category] || 'bg-gray-50 text-gray-600 border-gray-200';

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            onClick={() => setSelectedTemplate(item)}
                                                            className="group relative mt-3 flex cursor-pointer flex-col overflow-visible rounded border border-gray-200 bg-white shadow-sm transition hover:border-gray-400 hover:shadow-md"
                                                        >
                                                            <span className={`absolute left-4 top-0 z-10 inline-flex -translate-y-1/2 items-center rounded-full border px-3 py-0.5 text-[10px] font-semibold shadow-sm ${catStyle}`}>
                                                                {item.category}
                                                            </span>
                                                            {/* Top accent bar */}
                                                            <div className="h-px w-full bg-gray-300" />

                                                            <div className="relative h-[286px] overflow-hidden rounded-t bg-[#ece5dd]">
                                                                <div className="absolute inset-0 opacity-[0.38] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]" />
                                                                <div className="relative flex h-full flex-col p-4">
                                                                    <div className="mb-2 flex items-center justify-end gap-2">
                                                                        <span className="text-[10px] font-medium text-gray-500">{item.language === 'en_US' ? 'English (US)' : item.language}</span>
                                                                    </div>
                                                                    <div className="max-w-[72%] rounded bg-white shadow-sm">
                                                                        <div className="px-3 py-2.5">
                                                                            {headerComp?.format === 'TEXT' && (
                                                                                <p className="mb-1.5 text-sm font-semibold leading-5 text-gray-800">{headerComp.text}</p>
                                                                            )}
                                                                            {headerComp?.format === 'IMAGE' && (
                                                                                <img
                                                                                    src="/images/Image-Placeholder.jpg"
                                                                                    alt="Template image placeholder"
                                                                                    className="mb-2 h-14 w-full rounded object-cover"
                                                                                    loading="lazy"
                                                                                />
                                                                            )}
                                                                            <p className="text-[12px] leading-5 text-gray-800 whitespace-pre-line">
                                                                                {renderTemplateText(bodyComp?.text || 'No message body')}
                                                                            </p>
                                                                            <p className="mt-1 text-right text-[10px] text-gray-400">7:02 AM</p>
                                                                        </div>
                                                                        {buttonsComp?.buttons?.length > 0 && (
                                                                            <div className="border-t border-gray-200">
                                                                                {buttonsComp.buttons.slice(0, 1).map((btn, i) => (
                                                                                    <div key={i} className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-medium text-[#008069]">
                                                                                        {btn.type === 'URL' ? <ExternalLink className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                                                                                        <span className="truncate">{btn.text}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#ece5dd] to-transparent" />
                                                                </div>
                                                            </div>

                                                            <div className="flex min-h-14 items-center justify-between gap-3 border-t border-gray-200 bg-white px-3 py-2.5">
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-medium text-gray-700">{item.name}</p>
                                                                    <p className="text-[11px] text-gray-400">{item.industry}</p>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleAddToMyTemplates(item);
                                                                    }}
                                                                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                                                                >
                                                                    <Plus className="h-3.5 w-3.5" />
                                                                    Use
                                                                </button>
                                                            </div>

                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Modals */}
                <CreateTemplateModal
                    isOpen={iscreateOpen}
                    onClose={() => {
                        setIsCreateOpen(false);
                        setPrefilledTemplate(null);
                    }}
                    onSuccess={handleCreateSuccess}
                    apiCall={apiCall}
                    initialData={prefilledTemplate}
                />
                <ViewTemplateModal
                    template={selectedTemplate}
                    onClose={() => setSelectedTemplate(null)}
                    onAddToMyTemplates={(tpl) => {
                        setSelectedTemplate(null);
                        handleAddToMyTemplates(tpl);
                    }}
                />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage your WhatsApp message templates</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <TourButton />
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        data-tour="templates-create"
                        className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        New Template
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div data-tour="templates-filters" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-3">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Category Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                            className="inline-flex items-center gap-2 bg-white border border-gray-300 rounded-xl px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500/20 shadow-sm transition-all"
                        >
                            <Filter className="h-4 w-4 text-gray-400" />
                            {activeTab === 'ALL' ? 'All Templates' : activeTab.charAt(0) + activeTab.slice(1).toLowerCase()}
                            <ChevronDown className="h-4 w-4 text-gray-400 ml-1" />
                        </button>

                        {showCategoryDropdown && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
                                <div className="absolute left-0 mt-1.5 w-48 rounded-xl border border-gray-200 bg-white shadow-lg z-20 py-1.5 animate-in fade-in slide-in-from-top-1 duration-100">
                                    {[
                                        { val: 'ALL', label: 'All Templates' },
                                        { val: 'MARKETING', label: 'Marketing' },
                                        { val: 'UTILITY', label: 'Utility' },
                                        { val: 'AUTHENTICATION', label: 'Authentication' }
                                    ].map((opt) => (
                                        <button
                                            key={opt.val}
                                            onClick={() => {
                                                setActiveTab(opt.val);
                                                setShowCategoryDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${activeTab === opt.val
                                                ? 'bg-green-50 text-green-700 font-semibold'
                                                : 'text-gray-700 hover:bg-gray-50'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="hidden sm:block h-6 w-px bg-gray-200" />

                    {/* Status Tabs */}
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200/50 shadow-sm">
                        {[
                            { status: 'APPROVED', label: 'Approved', count: approvedCount, icon: CheckCircle, activeColor: 'text-emerald-500', dotColor: 'bg-emerald-500' },
                            { status: 'PENDING', label: 'Pending', count: pendingCount, icon: Clock, activeColor: 'text-amber-500', dotColor: 'bg-amber-500' },
                            { status: 'DRAFT', label: 'Draft', count: draftCount, icon: FileText, activeColor: 'text-gray-500', dotColor: 'bg-gray-400' }
                        ].map((btn) => {
                            const isSelected = activeStatus === btn.status;
                            const Icon = btn.icon;
                            return (
                                <button
                                    key={btn.status}
                                    onClick={() => setActiveStatus(btn.status)}
                                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${isSelected
                                        ? 'bg-white text-gray-900 shadow-sm border border-gray-200/50'
                                        : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    <Icon className={`h-3.5 w-3.5 ${isSelected ? btn.activeColor : 'text-gray-400'}`} />
                                    <span>{btn.label}</span>
                                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${isSelected ? 'bg-gray-100 text-gray-700' : 'bg-gray-200/60 text-gray-400'
                                        }`}>
                                        {btn.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {fetchError && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="font-medium">Templates could not be refreshed</div>
                        <div className="mt-0.5">{fetchError}</div>
                    </div>
                    <button onClick={fetchData} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                    </button>
                </div>
            )}

            {loading && (
                <div data-tour="templates-list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-[340px] animate-pulse rounded-xl border border-gray-200 bg-white p-5">
                            <div className="h-10 w-10 rounded-lg bg-gray-100" />
                            <div className="mt-5 h-4 w-36 rounded bg-gray-100" />
                            <div className="mt-3 h-16 rounded bg-gray-100" />
                            <div className="mt-5 h-3 w-full rounded bg-gray-100" />
                        </div>
                    ))}
                </div>
            )}

            {/* Grid */}
            {!loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredTemplates.length === 0 ? (
                        <div className="col-span-full py-16 px-6 flex flex-col items-center justify-center text-center bg-white border border-dashed border-neutral-250 rounded-3xl max-w-md mx-auto w-full shadow-[0_8px_30px_rgb(0,0,0,0.015)] my-6">
                            <div className="h-12 w-12 rounded-full bg-neutral-50 flex items-center justify-center border border-neutral-100 mb-4 text-neutral-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                                <FileText className="h-5 w-5 stroke-[1.5]" />
                            </div>
                            <h3 className="text-sm font-semibold text-neutral-950 tracking-tight">No templates found</h3>
                            <p className="text-[13px] text-neutral-500 mt-2 max-w-[280px] leading-relaxed font-normal">
                                {activeStatus === 'APPROVED' && "Templates approved by Meta for marketing, utility, or authentication will appear here."}
                                {activeStatus === 'PENDING' && "Newly created message templates currently undergoing Meta verification will appear here."}
                                {activeStatus === 'DRAFT' && "Locally saved drafts and templates rejected by Meta will appear here."}
                            </p>
                            <button
                                onClick={() => setIsCreateOpen(true)}
                                className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                Create template
                            </button>
                        </div>
                    ) : (
                        filteredTemplates.map((template) => (
                            <div
                                key={template.id || template.name}
                                onClick={() => setSelectedTemplate(template)}
                                className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md hover:border-green-300 transition-all cursor-pointer relative flex flex-col h-full min-h-[300px]"
                            >
                                {/* Header row: icon + name + status + delete */}
                                <div className="flex items-start justify-between gap-2 mb-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-medium text-gray-900 truncate max-w-[130px] text-sm">{template.name}</h3>
                                            <p className="text-xs text-gray-400 mt-0.5">{template.language}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${template.status === 'APPROVED' ? 'bg-green-50 text-green-700 border-green-100' :
                                            template.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' :
                                                template.status === 'DRAFT' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                                                    'bg-red-50 text-red-700 border-red-100'
                                            }`}>
                                            {template.status === 'APPROVED' && <CheckCircle className="h-3 w-3" />}
                                            {template.status === 'PENDING' && <Clock className="h-3 w-3" />}
                                            {template.status === 'DRAFT' && <FileText className="h-3 w-3" />}
                                            {template.status === 'REJECTED' && <XCircle className="h-3 w-3" />}
                                            {template.status}
                                        </span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(template.name); }}
                                            className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                                            title="Delete template"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Preview — fixed height so all cards align uniformly */}
                                <div className="flex-1">
                                    <div className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-1.5">Preview</div>
                                    <div className="bg-gray-50 rounded-lg p-3 h-[120px] overflow-hidden relative">
                                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-5">
                                            {template.components?.find((c) => c.type === 'BODY')?.text || 'No preview available'}
                                        </p>
                                        {/* Fade out at bottom for long text */}
                                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-gray-50 to-transparent rounded-b-lg pointer-events-none" />
                                    </div>
                                </div>

                                {/* Footer — always at bottom */}
                                <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                                    <span className="font-medium">{template.category}</span>
                                    <span>Updated {formatDateToIST(template.last_updated)}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <CreateTemplateModal
                isOpen={iscreateOpen}
                onClose={() => {
                    setIsCreateOpen(false);
                    setPrefilledTemplate(null);
                }}
                onSuccess={handleCreateSuccess}
                apiCall={apiCall}
                initialData={prefilledTemplate}
            />
            <ViewTemplateModal
                template={selectedTemplate}
                onClose={() => setSelectedTemplate(null)}
                onAddToMyTemplates={(tpl) => {
                    setSelectedTemplate(null);
                    handleAddToMyTemplates(tpl);
                }}
            />
        </div>
    )
}

function CustomSelect({ value, onChange, options, className = "" }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = options.find(opt => opt.value === value) || options[0];

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full inline-flex items-center justify-between rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 shadow-sm transition-all text-left ${className}`}
            >
                <span className="truncate">{selectedOption ? selectedOption.label : 'Select...'}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-gray-600' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-0 mt-1.5 w-full rounded-xl border border-gray-200 bg-white shadow-xl z-40 py-1.5 animate-in fade-in slide-in-from-top-1 duration-100 max-h-60 overflow-y-auto">
                        {options.map((opt) => {
                            const isSelected = value === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-4 py-2 text-sm transition-colors ${isSelected
                                        ? 'bg-green-50 text-green-700 font-semibold'
                                        : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {isSelected && <Check className="h-4 w-4 text-green-600 flex-shrink-0 ml-2" />}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

function renderTemplateText(text) {
    return String(text || '').split(/(\{\{\d+\}\})/g).map((part, index) => (
        /\{\{\d+\}\}/.test(part)
            ? <span key={`${part}-${index}`} className="font-semibold text-[#2d7d0b]">{part}</span>
            : part
    ));
}

function ViewTemplateModal({ template, onClose, onAddToMyTemplates }) {
    if (!template) return null;

    const headerComp = template.components?.find(c => c.type === 'HEADER');
    const bodyComp = template.components?.find(c => c.type === 'BODY');
    const footerComp = template.components?.find(c => c.type === 'FOOTER');
    const buttonsComp = template.components?.find(c => c.type === 'BUTTONS');
    const headerExample = headerComp?.example || {};
    const headerMediaUrl =
        headerComp?.media_url ||
        headerComp?.url ||
        headerComp?.link ||
        headerExample?.header_url?.[0] ||
        headerExample?.header_handle?.find?.((value) => String(value).startsWith('http'));

    return (
        <Modal isOpen={!!template} onClose={onClose} title={`View Template: ${template.name}`} maxWidth="max-w-md">
            <div className="bg-gray-100 rounded-2xl p-4 flex flex-col items-center">
                <div className="w-full h-full bg-[#E5DDD5] rounded-xl overflow-hidden shadow-inner flex flex-col p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
                    <div className="bg-white rounded-lg p-3 pb-6 pr-12 shadow-sm rounded-tr-none max-w-[90%] self-start relative">
                        {headerComp?.format === 'TEXT' && <p className="font-bold text-gray-800 text-sm mb-2">{headerComp.text}</p>}
                        {headerComp?.format === 'IMAGE' && (
                            headerMediaUrl ? (
                                <img src={headerMediaUrl} alt="Template header" className="w-full h-32 object-cover rounded mb-2 bg-gray-100" />
                            ) : (
                                <img
                                    src="/images/Image-Placeholder.jpg"
                                    alt="Template image placeholder"
                                    className="mb-2 h-32 w-full rounded bg-gray-100 object-cover"
                                />
                            )
                        )}
                        {headerComp?.format === 'VIDEO' && (
                            <div className="h-32 bg-gray-200 rounded mb-2 flex flex-col items-center justify-center text-gray-400">
                                <Video className="h-8 w-8" />
                                <span className="text-[10px] mt-1 tracking-wider uppercase">Video Attachment</span>
                            </div>
                        )}

                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {bodyComp?.text || ''}
                        </p>

                        {footerComp?.text && <p className="text-[10px] text-gray-400 mt-1">{footerComp.text}</p>}
                        <span className="text-[10px] text-gray-400 absolute bottom-1 right-2">10:00 AM</span>
                    </div>

                    {buttonsComp?.buttons?.length > 0 && (
                        <div className="mt-2 space-y-1 w-[90%] self-start">
                            {buttonsComp.buttons.map((btn, i) => (
                                <div key={i} className="bg-white rounded text-center py-2 text-cyan-600 text-sm font-medium shadow-sm truncate px-2">
                                    {btn.type === 'URL' && <LinkIcon className="inline w-3 h-3 mr-1" />}
                                    {btn.type === 'PHONE_NUMBER' && <Phone className="inline w-3 h-3 mr-1" />}
                                    {btn.text}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-4 pt-4 flex justify-between items-center border-t border-gray-100">
                {template.industry ? (
                    <button
                        onClick={() => onAddToMyTemplates(template)}
                        className="px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                    >
                        <Plus className="h-4 w-4" /> Add to My Templates
                    </button>
                ) : <div />}
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm transition-colors">
                    Close View
                </button>
            </div>
        </Modal>
    )
}

function CreateTemplateModal({ isOpen, onClose, onSuccess, apiCall, initialData }) {
    const [data, setData] = useState({
        name: '',
        category: 'MARKETING',
        language: 'en_US',
        headerType: 'NONE', // NONE, IMAGE, TEXT, VIDEO
        headerText: '',
        bodyText: '',
        footerText: '',
        buttons: [] // { type: 'QUICK_REPLY', text: 'Yes', url: '', phone_number: '' }
    })
    const [file, setFile] = useState(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState('')

    const fieldClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/20 placeholder:text-gray-400'
    const normalizedName = data.name.trim()
    const bodyLength = data.bodyText.length
    const previewFileUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
    const canSubmit = normalizedName && /^[a-z0-9_]+$/.test(normalizedName) && data.bodyText.trim() && bodyLength <= 1024 && !(data.headerType === 'TEXT' && !data.headerText.trim()) && !((data.headerType === 'IMAGE' || data.headerType === 'VIDEO') && !file)

    useEffect(() => {
        if (initialData && isOpen) {
            const headerComp = initialData.components?.find(c => c.type === 'HEADER');
            const bodyComp = initialData.components?.find(c => c.type === 'BODY');
            const footerComp = initialData.components?.find(c => c.type === 'FOOTER');
            const buttonsComp = initialData.components?.find(c => c.type === 'BUTTONS');

            setData({
                name: initialData.name || '',
                category: initialData.category || 'MARKETING',
                language: initialData.language || 'en_US',
                headerType: headerComp?.format || 'NONE',
                headerText: headerComp?.text || '',
                bodyText: bodyComp?.text || '',
                footerText: footerComp?.text || '',
                buttons: buttonsComp?.buttons?.map(b => ({
                    type: b.type,
                    text: b.text,
                    url: b.url || '',
                    phone_number: b.phone_number || ''
                })) || []
            });
        } else if (isOpen) {
            setData({
                name: '',
                category: 'MARKETING',
                language: 'en_US',
                headerType: 'NONE',
                headerText: '',
                bodyText: '',
                footerText: '',
                buttons: []
            });
        }
    }, [initialData, isOpen]);

    useEffect(() => {
        return () => {
            if (previewFileUrl) URL.revokeObjectURL(previewFileUrl)
        }
    }, [previewFileUrl])

    const closeModal = () => {
        if (isSubmitting) return
        setSubmitError('')
        onClose()
    }

    const updateButton = (index, patch) => {
        setData(prev => {
            const buttons = [...prev.buttons]
            buttons[index] = { ...buttons[index], ...patch }
            return { ...prev, buttons }
        })
    }

    const addVariable = () => {
        const matches = data.bodyText.match(/\{\{(\d+)\}\}/g)
        const nextNum = matches ? Math.max(...matches.map(m => Number(m.replace(/[^0-9]/g, '')))) + 1 : 1
        setData(prev => ({ ...prev, bodyText: `${prev.bodyText}${prev.bodyText ? ' ' : ''}{{${nextNum}}}` }))
    }

    const addButton = () => {
        setData(prev => ({
            ...prev,
            buttons: [...prev.buttons, { type: 'QUICK_REPLY', text: `Button ${prev.buttons.length + 1}`, url: '', phone_number: '' }]
        }))
    }

    // Submit handler
    const handleSubmit = async () => {
        setSubmitError('')
        if (!canSubmit) {
            setSubmitError('Complete the required fields before submitting for review.')
            return
        }

        setIsSubmitting(true)
        try {
            const formData = new FormData();
            formData.append('name', normalizedName);
            formData.append('category', data.category);
            formData.append('language', data.language);

            const components = [];

            if (data.headerType !== 'NONE') {
                const headerComp = { type: 'HEADER', format: data.headerType };
                if (data.headerType === 'TEXT') {
                    headerComp.text = data.headerText;
                    const matches = data.headerText.match(/\{\{(\d+)\}\}/g);
                    if (matches) {
                        const varIndices = matches.map(m => parseInt(m.replace(/[^0-9]/g, ''), 10));
                        const maxVar = Math.max(...varIndices);
                        if (maxVar > 0) {
                            headerComp.example = {
                                header_text: Array.from({ length: maxVar }, (_, i) => `Sample ${i + 1}`)
                            };
                        }
                    }
                }
                components.push(headerComp);
            }

            if (data.bodyText) {
                const bodyComp = { type: 'BODY', text: data.bodyText };
                const matches = data.bodyText.match(/\{\{(\d+)\}\}/g);
                if (matches) {
                    const varIndices = matches.map(m => parseInt(m.replace(/[^0-9]/g, ''), 10));
                    const maxVar = Math.max(...varIndices);
                    if (maxVar > 0) {
                        bodyComp.example = {
                            body_text: [
                                Array.from({ length: maxVar }, (_, i) => `Sample ${i + 1}`)
                            ]
                        };
                    }
                }
                components.push(bodyComp);
            }

            if (data.footerText) {
                components.push({ type: 'FOOTER', text: data.footerText });
            }

            if (data.buttons.length > 0) {
                components.push({
                    type: 'BUTTONS',
                    buttons: data.buttons.map(b => {
                        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
                        if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
                        return { type: 'QUICK_REPLY', text: b.text };
                    })
                });
            }

            formData.append('components', JSON.stringify(components));
            if (file && (data.headerType === 'IMAGE' || data.headerType === 'VIDEO')) {
                formData.append('file', file);
            }

            const res = await apiCall(`${API_URL}/api/whatsapp/templates`, {
                method: 'POST',
                body: formData
            });

            const json = await res.json();
            if (res.ok) {
                if (onSuccess) onSuccess();
                closeModal();
            } else {
                setSubmitError(json.error || 'Failed to create template');
            }
        } catch (e) {
            console.error(e);
            setSubmitError('Error creating template');
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!isOpen) return null

    return (
        <Modal isOpen={isOpen} onClose={closeModal} title="Create Message Template" maxWidth="max-w-5xl">
            <div className="grid h-[540px] max-h-[calc(78vh-60px)] gap-6 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="h-full overflow-y-auto pr-3">
                    {submitError ? (
                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{submitError}</span>
                        </div>
                    ) : null}

                    <div className="space-y-5">
                        <section className="space-y-4">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-800">Template name</label>
                                <input
                                    type="text"
                                    className={`${fieldClass} ${normalizedName && !/^[a-z0-9_]+$/.test(normalizedName) ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : ''}`}
                                    placeholder="welcome_offer_v2"
                                    value={data.name}
                                    onChange={e => setData({ ...data, name: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                                />
                                <p className="mt-1.5 text-xs text-gray-500">Use lowercase letters, numbers, and underscores only.</p>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1.5 block text-sm font-semibold text-gray-800">Category</label>
                                    <CustomSelect
                                        value={data.category}
                                        onChange={val => setData({ ...data, category: val })}
                                        options={[
                                            { value: 'MARKETING', label: 'Marketing' },
                                            { value: 'UTILITY', label: 'Utility' },
                                            { value: 'AUTHENTICATION', label: 'Authentication' }
                                        ]}
                                    />
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-sm font-semibold text-gray-800">Language</label>
                                    <CustomSelect
                                        value={data.language}
                                        onChange={val => setData({ ...data, language: val })}
                                        options={[
                                            { value: 'en_US', label: 'English (US)' },
                                            { value: 'es_ES', label: 'Spanish' },
                                            { value: 'pt_BR', label: 'Portuguese' }
                                        ]}
                                    />
                                </div>
                            </div>
                        </section>

                        <section className="border-t border-gray-100 pt-5">
                            <div className="mb-3 flex items-center gap-2">
                                <Type className="h-4 w-4 text-gray-500" />
                                <h4 className="text-sm font-semibold text-gray-900">Header</h4>
                                <span className="text-xs text-gray-400">Optional</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {['NONE', 'TEXT', 'IMAGE', 'VIDEO'].map(t => {
                                    const Icon = t === 'IMAGE' ? ImageIcon : t === 'VIDEO' ? Video : Type
                                    return (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => {
                                                setFile(null)
                                                setData({ ...data, headerType: t })
                                            }}
                                            className={`flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition ${data.headerType === t ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            {t === 'NONE' ? null : <Icon className="h-4 w-4" />}
                                            {t.charAt(0) + t.slice(1).toLowerCase()}
                                        </button>
                                    )
                                })}
                            </div>

                            {data.headerType === 'TEXT' ? (
                                <input
                                    type="text"
                                    className={`${fieldClass} mt-3`}
                                    placeholder="Short headline for the message"
                                    value={data.headerText}
                                    onChange={e => setData({ ...data, headerText: e.target.value })}
                                />
                            ) : null}

                            {(data.headerType === 'IMAGE' || data.headerType === 'VIDEO') ? (
                                <div className="relative mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center transition hover:border-green-400 hover:bg-green-50/50">
                                    {file ? (
                                        <div className="flex items-center justify-between gap-3 text-left">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
                                                    <CheckCircle className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold text-gray-900">{file.name}</div>
                                                    <div className="text-xs text-gray-500">{Math.ceil(file.size / 1024)} KB selected</div>
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => setFile(null)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Remove</button>
                                        </div>
                                    ) : (
                                        <>
                                            <UploadCloud className="mx-auto h-7 w-7 text-gray-400" />
                                            <div className="mt-2 text-sm font-semibold text-gray-800">Upload {data.headerType.toLowerCase()} sample</div>
                                            <div className="mt-1 text-xs text-gray-500">Required by Meta for media header approval.</div>
                                            <input type="file" accept={data.headerType === 'IMAGE' ? 'image/*' : 'video/mp4'} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={e => setFile(e.target.files?.[0] || null)} />
                                        </>
                                    )}
                                </div>
                            ) : null}
                        </section>

                        <section className="border-t border-gray-100 pt-5">
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                    <MessageSquareText className="h-4 w-4 text-gray-500" />
                                    Body text
                                </label>
                                <span className={`text-xs ${bodyLength > 1024 ? 'text-red-600' : 'text-gray-400'}`}>{bodyLength}/1024</span>
                            </div>
                            <textarea
                                className={`${fieldClass} min-h-32 resize-y font-mono leading-6`}
                                rows={5}
                                placeholder="Hello {{1}}, your order is ready!"
                                value={data.bodyText}
                                maxLength={1100}
                                onChange={e => setData({ ...data, bodyText: e.target.value })}
                            />
                            <div className="mt-2 flex items-center justify-between">
                                <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50" onClick={addVariable}>
                                    <Plus className="h-3.5 w-3.5" />
                                    Add variable
                                </button>
                                {!data.bodyText.trim() ? <span className="text-xs text-gray-500">Body is required.</span> : null}
                            </div>
                        </section>

                        <section className="space-y-4 border-t border-gray-100 pt-5">
                            <div>
                                <label className="mb-1.5 block text-sm font-semibold text-gray-800">Footer <span className="font-normal text-gray-400">Optional</span></label>
                                <input className={fieldClass} placeholder="Reply STOP to unsubscribe" value={data.footerText} onChange={e => setData({ ...data, footerText: e.target.value })} />
                            </div>

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                        <MousePointerClick className="h-4 w-4 text-gray-500" />
                                        Buttons <span className="font-normal text-gray-400">Optional</span>
                                    </label>
                                    <span className="text-xs text-gray-400">{data.buttons.length}/3</span>
                                </div>
                                <div className="space-y-2">
                                    {data.buttons.map((btn, i) => (
                                        <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                            <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                                                <CustomSelect
                                                    value={btn.type}
                                                    onChange={val => updateButton(i, { type: val, url: '', phone_number: '' })}
                                                    options={[
                                                        { value: 'QUICK_REPLY', label: 'Quick reply' },
                                                        { value: 'URL', label: 'Website' },
                                                        { value: 'PHONE_NUMBER', label: 'Phone' }
                                                    ]}
                                                    className="py-2"
                                                />
                                                <input className={`${fieldClass} py-2`} placeholder="Button text" value={btn.text} onChange={e => updateButton(i, { text: e.target.value })} />
                                                <button type="button" onClick={() => setData(prev => ({ ...prev, buttons: prev.buttons.filter((_, idx) => idx !== i) }))} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                            {btn.type === 'URL' ? (
                                                <input className={`${fieldClass} mt-2 py-2`} placeholder="https://example.com" value={btn.url || ''} onChange={e => updateButton(i, { url: e.target.value })} />
                                            ) : null}
                                            {btn.type === 'PHONE_NUMBER' ? (
                                                <input className={`${fieldClass} mt-2 py-2`} placeholder="+919999999999" value={btn.phone_number || ''} onChange={e => updateButton(i, { phone_number: `+${e.target.value.replace(/[^0-9]/g, '')}` })} />
                                            ) : null}
                                        </div>
                                    ))}
                                    {data.buttons.length < 3 ? (
                                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50" onClick={addButton}>
                                            <Plus className="h-4 w-4" />
                                            Add button
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <aside className="hidden min-h-0 rounded-2xl bg-gray-100 p-4 lg:flex lg:flex-col h-full">
                    <div className="mb-3 flex items-center justify-between px-1">
                        <div className="text-sm font-semibold text-gray-800">Live preview</div>
                        <div className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500">WhatsApp</div>
                    </div>
                    <div className="flex-1 min-h-0 rounded-xl bg-[#E5DDD5] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] p-4 shadow-inner overflow-y-auto">
                        <div className="relative max-h-full max-w-[92%] overflow-hidden rounded-lg rounded-tr-none bg-white p-3 pb-6 pr-10 text-sm shadow-sm">
                            {data.headerType === 'TEXT' && data.headerText ? <p className="mb-2 font-bold text-gray-900">{data.headerText}</p> : null}
                            {data.headerType === 'IMAGE' ? (
                                previewFileUrl ? <img src={previewFileUrl} alt="Preview" className="mb-2 h-36 w-full rounded object-cover bg-gray-100" /> : <div className="mb-2 flex h-36 items-center justify-center rounded bg-gray-100 text-gray-400"><ImageIcon className="h-8 w-8" /></div>
                            ) : null}
                            {data.headerType === 'VIDEO' ? (
                                previewFileUrl ? <video src={previewFileUrl} className="mb-2 h-36 w-full rounded object-cover bg-gray-100" controls muted /> : <div className="mb-2 flex h-36 items-center justify-center rounded bg-gray-100 text-gray-400"><Video className="h-8 w-8" /></div>
                            ) : null}
                            <p className="whitespace-pre-wrap break-words leading-5 text-gray-800">{data.bodyText || 'Start typing to preview...'}</p>
                            {data.footerText ? <p className="mt-2 text-[11px] text-gray-400">{data.footerText}</p> : null}
                            <span className="absolute bottom-1 right-2 text-[10px] text-gray-400">10:00 AM</span>
                        </div>
                        {data.buttons.length > 0 ? (
                            <div className="mt-2 max-w-[92%] space-y-1">
                                {data.buttons.map((btn, i) => (
                                    <div key={i} className="truncate rounded bg-white px-3 py-2 text-center text-sm font-medium text-cyan-600 shadow-sm">{btn.text || 'Button text'}</div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </aside>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
                <button
                    onClick={closeModal}
                    disabled={isSubmitting}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    disabled={isSubmitting || !canSubmit}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={handleSubmit}
                >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isSubmitting ? 'Submitting...' : 'Submit for review'}
                </button>
            </div>
        </Modal>
    )
}
