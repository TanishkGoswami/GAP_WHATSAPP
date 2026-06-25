import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import {
    Copy, ExternalLink, Share2, CheckCircle2,
    ChevronDown, Zap, QrCode, Search, X, Phone, Wifi,
    Battery, Signal, Camera, SmilePlus, ArrowRight,
    Link2, Users, ShoppingBag, Headphones, Instagram,
    Facebook, Twitter, Youtube, Globe, Check, Sparkles,
    ArrowUpRight, Send
} from 'lucide-react'

// ─── Country Data ─────────────────────────────────────────────────────────────
const COUNTRIES = [
    { code: 'IN', name: 'India', dial: '91', flag: '🇮🇳' },
    { code: 'US', name: 'United States', dial: '1', flag: '🇺🇸' },
    { code: 'GB', name: 'United Kingdom', dial: '44', flag: '🇬🇧' },
    { code: 'AE', name: 'UAE', dial: '971', flag: '🇦🇪' },
    { code: 'SA', name: 'Saudi Arabia', dial: '966', flag: '🇸🇦' },
    { code: 'PK', name: 'Pakistan', dial: '92', flag: '🇵🇰' },
    { code: 'BD', name: 'Bangladesh', dial: '880', flag: '🇧🇩' },
    { code: 'SG', name: 'Singapore', dial: '65', flag: '🇸🇬' },
    { code: 'AU', name: 'Australia', dial: '61', flag: '🇦🇺' },
    { code: 'CA', name: 'Canada', dial: '1', flag: '🇨🇦' },
    { code: 'DE', name: 'Germany', dial: '49', flag: '🇩🇪' },
    { code: 'FR', name: 'France', dial: '33', flag: '🇫🇷' },
    { code: 'BR', name: 'Brazil', dial: '55', flag: '🇧🇷' },
    { code: 'ZA', name: 'South Africa', dial: '27', flag: '🇿🇦' },
    { code: 'NG', name: 'Nigeria', dial: '234', flag: '🇳🇬' },
    { code: 'ID', name: 'Indonesia', dial: '62', flag: '🇮🇩' },
    { code: 'MY', name: 'Malaysia', dial: '60', flag: '🇲🇾' },
    { code: 'PH', name: 'Philippines', dial: '63', flag: '🇵🇭' },
    { code: 'TH', name: 'Thailand', dial: '66', flag: '🇹🇭' },
    { code: 'TR', name: 'Turkey', dial: '90', flag: '🇹🇷' },
    { code: 'EG', name: 'Egypt', dial: '20', flag: '🇪🇬' },
    { code: 'KE', name: 'Kenya', dial: '254', flag: '🇰🇪' },
    { code: 'GH', name: 'Ghana', dial: '233', flag: '🇬🇭' },
    { code: 'JP', name: 'Japan', dial: '81', flag: '🇯🇵' },
    { code: 'KR', name: 'South Korea', dial: '82', flag: '🇰🇷' },
    { code: 'MX', name: 'Mexico', dial: '52', flag: '🇲🇽' },
    { code: 'IT', name: 'Italy', dial: '39', flag: '🇮🇹' },
    { code: 'ES', name: 'Spain', dial: '34', flag: '🇪🇸' },
    { code: 'NL', name: 'Netherlands', dial: '31', flag: '🇳🇱' },
    { code: 'RU', name: 'Russia', dial: '7', flag: '🇷🇺' },
]

const QUICK_MESSAGES = [
    { label: 'Hello 👋', text: 'Hello! I want to know more about your services.' },
    { label: 'Pricing 💰', text: 'Hi, can you please share your pricing details?' },
    { label: 'Demo 🎯', text: "I'd like to schedule a demo. When are you available?" },
    { label: 'Support 🛠', text: "Hi, I need help with an issue I'm facing." },
    { label: 'Order 📦', text: "Hi, I'd like to place an order. Can you help?" },
]

const MAX_MESSAGE = 500

// ─── Accordion ────────────────────────────────────────────────────────────────
function Accordion({ title, icon: Icon, children, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="overflow-hidden rounded-2xl border border-gray-200/70 bg-white/80 backdrop-blur-sm shadow-sm transition-shadow hover:shadow-md">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50/60"
            >
                <div className="flex items-center gap-2.5">
                    {Icon && <Icon className="h-4 w-4 text-[#25D366]" />}
                    <span className="text-[13px] font-semibold text-gray-900">{title}</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="border-t border-gray-100/80 px-5 py-4 text-[13px] text-gray-600 leading-relaxed">
                    {children}
                </div>
            </div>
        </div>
    )
}

// ─── Country Selector ─────────────────────────────────────────────────────────
function CountrySelector({ value, onChange }) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const ref = useRef(null)
    const selected = COUNTRIES.find(c => c.code === value) || COUNTRIES[0]

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return COUNTRIES.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.dial.includes(q) ||
            c.code.toLowerCase().includes(q)
        )
    }, [search])

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    return (
        <div ref={ref} className="relative shrink-0">
            <button
                type="button"
                onClick={() => { setOpen(o => !o); setSearch('') }}
                className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white/80 px-3 text-[13px] font-semibold text-gray-800 shadow-sm transition-all hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#25D366]/25 whitespace-nowrap"
            >
                <span className="text-base leading-none">{selected.flag}</span>
                <span className="text-gray-600">+{selected.dial}</span>
                <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute left-0 top-12 z-50 w-68 min-w-[260px] rounded-2xl border border-gray-200/80 bg-white/95 backdrop-blur-xl shadow-2xl shadow-gray-900/15 overflow-hidden">
                    <div className="p-2.5 border-b border-gray-100">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                placeholder="Search country or code..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-[#25D366] focus:bg-white focus:ring-2 focus:ring-[#25D366]/20 transition-all"
                            />
                        </div>
                    </div>
                    <div className="max-h-52 overflow-y-auto py-1">
                        {filtered.map(c => (
                            <button
                                key={c.code}
                                type="button"
                                onClick={() => { onChange(c.code); setOpen(false) }}
                                className={`flex w-full items-center gap-3 px-3.5 py-2 text-[13px] transition-colors hover:bg-gray-50 ${c.code === value ? 'bg-[#f0fdf4] text-[#16a34a] font-semibold' : 'text-gray-700'}`}
                            >
                                <span className="text-base leading-none shrink-0">{c.flag}</span>
                                <span className="flex-1 text-left truncate">{c.name}</span>
                                <span className="shrink-0 text-[11px] font-mono text-gray-400">+{c.dial}</span>
                                {c.code === value && <Check className="h-3.5 w-3.5 text-[#25D366] shrink-0" />}
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="px-3 py-6 text-center text-xs text-gray-400">No country found</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Premium Phone Preview ────────────────────────────────────────────────────
function PhonePreview({ phoneNumber, message, countryDial }) {
    const [visible, setVisible] = useState(false)
    const prevMsg = useRef('')

    useEffect(() => {
        if (message !== prevMsg.current) {
            setVisible(false)
            const t = setTimeout(() => {
                setVisible(true)
                prevMsg.current = message
            }, 80)
            return () => clearTimeout(t)
        } else {
            setVisible(true)
        }
    }, [message])

    const displayNumber = phoneNumber ? `+${countryDial} ${phoneNumber}` : null
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    const clockStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })

    const avatarLetter = phoneNumber ? (phoneNumber[0] || '#') : '?'

    return (
        <div className="flex justify-center select-none">
            <div className="relative w-[248px]">
                {/* Ambient glow */}
                <div className="absolute -inset-3 rounded-2xl bg-gradient-to-b from-[#25D366]/8 via-transparent to-[#128C7E]/8 blur-xl pointer-events-none" />

                {/* Phone shell — minimal thin bezel */}
                <div className="relative rounded-[1.1rem] bg-[#1a1a1a] p-[2px] shadow-[0_20px_48px_rgba(0,0,0,0.38),0_0_0_1px_rgba(255,255,255,0.06)]">
                    {/* Inner screen edge */}
                    <div className="rounded-[0.95rem] overflow-hidden bg-[#111]">

                        {/* Slim status bar — no Dynamic Island */}
                        <div className="flex items-center justify-between bg-[#111] px-4 py-1.5">
                            <span className="text-[9px] font-semibold text-white/80 tracking-tight">{clockStr}</span>
                            <div className="flex items-center gap-1">
                                <Signal className="h-2 w-2 text-white/70" />
                                <Wifi className="h-2 w-2 text-white/70" />
                                <div className="h-1.5 w-4 rounded-full border border-white/30 p-px">
                                    <div className="h-full w-3/4 rounded-full bg-white/80" />
                                </div>
                            </div>
                        </div>

                        {/* WhatsApp screen */}
                        <div className="bg-white overflow-hidden">

                            {/* WA App header */}
                            <div
                                className="flex items-center gap-2.5 px-3 py-2"
                                style={{ background: 'linear-gradient(135deg, #075E54 0%, #128C7E 100%)' }}
                            >
                                {/* Avatar */}
                                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-lg"
                                    style={{ background: phoneNumber ? 'linear-gradient(135deg, #25D366, #075E54)' : '#374151' }}>
                                    <span className="text-sm font-bold text-white uppercase">{avatarLetter}</span>
                                    {/* Online dot */}
                                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#128C7E] bg-[#25D366]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="truncate text-[11px] font-bold text-white leading-tight">
                                        {displayNumber || 'Enter phone number'}
                                    </p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[#25D366]" />
                                        <span className="text-[9px] text-[#4ade80] font-medium">online</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Camera className="h-3.5 w-3.5 text-white/80" />
                                    <Phone className="h-3.5 w-3.5 text-white/80" />
                                </div>
                            </div>

                            {/* Chat area */}
                            <div
                                className="relative flex flex-col justify-end min-h-[400px] px-2.5 pt-3 pb-1 gap-2"
                                style={{
                                    backgroundImage: `
                                        radial-gradient(ellipse at top, rgba(37,211,102,0.04) 0%, transparent 60%),
                                        url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2325D366' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
                                    `,
                                    backgroundColor: '#efeae2',
                                }}
                            >
                                {/* Date chip */}
                                <div className="flex justify-center">
                                    <span className="rounded-full bg-[#d0ccc4]/80 px-2.5 py-0.5 text-[8px] font-medium text-[#5f5952] shadow-sm backdrop-blur-sm">
                                        Today
                                    </span>
                                </div>

                                {/* Message bubble */}
                                <div className="flex justify-start">
                                    <div
                                        className={`relative max-w-[88%] rounded-b-2xl rounded-tr-2xl bg-white px-3 py-2 transition-all duration-200 shadow-sm ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
                                        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))' }}
                                    >
                                        {/* Tail */}
                                        <svg className="absolute -left-[7px] top-0 h-4 w-4 text-white" viewBox="0 0 10 16" fill="currentColor">
                                            <path d="M0 0 L10 0 L10 16 Q0 8 0 0Z" />
                                        </svg>

                                        {message ? (
                                            <p className="whitespace-pre-wrap break-words text-[10.5px] leading-[1.45] text-gray-800">
                                                {message}
                                            </p>
                                        ) : (
                                            <p className="text-[10px] italic text-gray-400 leading-relaxed">
                                                Your message appears here...
                                            </p>
                                        )}

                                        {/* Timestamp + ticks */}
                                        <div className="mt-1 flex items-center justify-end gap-0.5">
                                            <span className="text-[7.5px] text-[#8a8a8a]">{timeStr}</span>
                                            <svg className="h-2.5 w-3.5 text-[#53bdeb]" viewBox="0 0 16 11" fill="currentColor">
                                                <path d="M11.071.653a.55.55 0 0 0-.756.196L6.443 7.272 4.709 5.538a.55.55 0 0 0-.777.777l2.16 2.16a.55.55 0 0 0 .849-.105l4.327-7.06a.55.55 0 0 0-.197-.657zM15.315.653a.55.55 0 0 0-.756.196l-3.87 6.423-1.22-1.22a.55.55 0 0 0-.778.778l1.547 1.547a.55.55 0 0 0 .849-.105L15.51 1.41a.55.55 0 0 0-.196-.756z" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Input bar */}
                            <div className="flex items-center gap-2 bg-[#f0f0f0] px-2.5 py-2 border-t border-gray-200/50">
                                <SmilePlus className="h-4.5 w-4.5 text-[#8a8a8a] shrink-0" />
                                <div className="flex-1 rounded-full bg-white px-3 py-1 shadow-sm">
                                    <p className="text-[8.5px] text-gray-300">Type a message</p>
                                </div>
                                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] shadow-sm shadow-green-500/30">
                                    <Send className="h-3 w-3 text-white" style={{ transform: 'translateX(0.5px)' }} />
                                </div>
                            </div>
                        </div>

                        {/* Home indicator */}
                        <div className="flex justify-center bg-[#111] py-1.5">
                            <div className="h-[3px] w-16 rounded-full bg-white/15" />
                        </div>
                    </div>
                </div>

                {/* Subtle reflection */}
                <div className="absolute inset-0 rounded-[1.1rem] pointer-events-none"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.06) 100%)',
                    }}
                />
            </div>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function WhatsAppLinkGenerator() {
    const [country, setCountry] = useState('IN')
    const [phone, setPhone] = useState('')
    const [message, setMessage] = useState('')
    const [generatedLink, setGeneratedLink] = useState('')
    const [linkCopied, setLinkCopied] = useState(false)
    const [phoneError, setPhoneError] = useState('')
    const textareaRef = useRef(null)

    const selectedCountry = COUNTRIES.find(c => c.code === country) || COUNTRIES[0]
    const sanitizedPhone = phone.replace(/\D/g, '')
    const fullNumber = sanitizedPhone ? `${selectedCountry.dial}${sanitizedPhone}` : ''

    const waLink = useMemo(() => {
        if (!sanitizedPhone) return ''
        const base = `https://wa.me/${fullNumber}`
        return message.trim()
            ? `${base}?text=${encodeURIComponent(message.trim())}`
            : base
    }, [fullNumber, sanitizedPhone, message])

    const validate = () => {
        if (!sanitizedPhone) { setPhoneError('Phone number is required'); return false }
        if (sanitizedPhone.length < 6) { setPhoneError('Too short'); return false }
        if (sanitizedPhone.length > 15) { setPhoneError('Too long'); return false }
        setPhoneError('')
        return true
    }

    const handleGenerate = () => {
        if (!validate()) return
        setGeneratedLink(waLink)
    }

    const handleCopyLink = async () => {
        const link = generatedLink || waLink
        if (!link) return
        await navigator.clipboard.writeText(link)
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2000)
    }

    const handleShare = async () => {
        const link = generatedLink || waLink
        if (!link) return
        if (navigator.share) {
            await navigator.share({ title: 'WhatsApp Link', url: link })
        } else {
            await navigator.clipboard.writeText(link)
        }
    }

    const handlePhoneChange = (e) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 15)
        setPhone(val)
        if (phoneError) setPhoneError('')
    }

    const insertQuickMessage = (text) => {
        setMessage(prev => prev ? `${prev} ${text}` : text)
        textareaRef.current?.focus()
    }

    const liveLink = waLink

    return (
        <div className="min-h-full" style={{ background: 'linear-gradient(160deg, #f8fafc 0%, #f0fdf4 35%, #f8fafc 70%, #f5f0ff 100%)' }}>

            {/* Subtle grid overlay */}
            <div className="pointer-events-none fixed inset-0 opacity-[0.015]"
                style={{ backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            />

            <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">

                {/* ── Hero ── */}
                <div className="mb-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3.5">
                            {/* Icon block */}
                            <div className="relative shrink-0">
                                <div className="absolute -inset-1.5 rounded-2xl bg-[#25D366]/20 blur-lg" />
                                <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25D366] to-[#128C7E] shadow-lg shadow-green-500/30">
                                    {/* Official WhatsApp logo SVG */}
                                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="white" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652c1.746.943 3.71 1.444 5.71 1.445h.006c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.48-8.448zM12.045 21.785h-.004a9.96 9.96 0 0 1-5.055-1.377l-.36-.214-3.75.977.999-3.648-.235-.374a9.86 9.86 0 0 1-1.516-5.26c.001-5.45 4.436-9.884 9.892-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.892 6.994c-.003 5.45-4.437 9.884-9.891 9.884zm5.43-7.403c-.297-.149-1.758-.867-2.03-.967-.273-.099-.47-.148-.668.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.668-1.612-.916-2.207-.241-.579-.486-.5-.668-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                                    </svg>
                                </div>
                            </div>

                            <div>
                                <h1 className="text-[22px] sm:text-2xl font-bold text-gray-900 tracking-tight leading-tight">
                                    WhatsApp Link Generator
                                </h1>
                                <p className="mt-1 text-[13px] text-gray-500 leading-snug max-w-sm">
                                    Create click-to-chat links with pre-filled messages and live phone preview.
                                </p>
                            </div>
                        </div>

                        {/* Info chips */}
                        <div className="flex flex-wrap gap-2">
                            {[
                                { icon: Zap, label: 'Instant Preview' },
                                { icon: QrCode, label: 'QR Ready' },
                                { icon: Link2, label: 'One Click Copy' },
                            ].map(({ icon: Icon, label }) => (
                                <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white/80 px-3 py-1 text-[11px] font-semibold text-gray-600 shadow-sm backdrop-blur-sm">
                                    <Icon className="h-3 w-3 text-[#25D366]" />
                                    {label}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── MAIN 2-COL GRID ── */}
                <div className="flex flex-col gap-5 lg:flex-row lg:gap-6 lg:items-start">

                    {/* ════ LEFT — FORM ════ */}
                    <div className="flex-1 min-w-0 space-y-3.5">

                        {/* ── Phone Number Card ── */}
                        <div className="rounded-2xl border border-gray-200/70 bg-white/90 backdrop-blur-sm p-5 shadow-sm ring-1 ring-gray-100/50">
                            <div className="mb-3.5 flex items-center gap-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-[10px] font-bold text-gray-500">1</div>
                                <h2 className="text-[13px] font-bold text-gray-900">WhatsApp Number</h2>
                            </div>

                            <div className="flex gap-2.5">
                                <CountrySelector value={country} onChange={setCountry} />
                                <div className="relative flex-1">
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        value={phone}
                                        onChange={handlePhoneChange}
                                        placeholder="9876543210"
                                        className={`w-full h-10 rounded-xl border bg-white/90 px-3.5 pr-9 text-[13px] font-medium text-gray-900 placeholder-gray-400 shadow-sm outline-none transition-all focus:ring-2 focus:ring-[#25D366]/25 focus:border-[#25D366] ${phoneError ? 'border-red-400 focus:ring-red-100 focus:border-red-400' : 'border-gray-200 hover:border-gray-300'}`}
                                    />
                                    {phone && (
                                        <button
                                            type="button"
                                            onClick={() => { setPhone(''); setPhoneError('') }}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200/80 text-gray-500 hover:bg-gray-300 transition-colors"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {phoneError && (
                                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-red-500">
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                                    {phoneError}
                                </p>
                            )}

                            {phone && !phoneError && (
                                <div className="mt-2.5 flex items-center gap-2">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#25D366] shrink-0" />
                                    <p className="text-[11px] text-gray-500">
                                        Full number: <span className="font-semibold text-gray-800">+{selectedCountry.dial} {phone}</span>
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── Message Card ── */}
                        <div className="rounded-2xl border border-gray-200/70 bg-white/90 backdrop-blur-sm p-5 shadow-sm ring-1 ring-gray-100/50">
                            <div className="mb-3.5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-[10px] font-bold text-gray-500">2</div>
                                    <h2 className="text-[13px] font-bold text-gray-900">Custom Message</h2>
                                </div>
                                <span className={`text-[10px] font-semibold tabular-nums rounded-full px-2 py-0.5 ${message.length > MAX_MESSAGE * 0.85 ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-gray-100 text-gray-400'}`}>
                                    {message.length}/{MAX_MESSAGE}
                                </span>
                            </div>

                            {/* Quick chips — horizontal scroll */}
                            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                                {QUICK_MESSAGES.map(q => (
                                    <button
                                        key={q.label}
                                        type="button"
                                        onClick={() => insertQuickMessage(q.text)}
                                        className="flex-shrink-0 rounded-full border border-gray-200/80 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-600 transition-all hover:border-[#25D366]/50 hover:bg-[#f0fdf4] hover:text-[#16a34a] active:scale-95 whitespace-nowrap"
                                    >
                                        {q.label}
                                    </button>
                                ))}
                            </div>

                            <textarea
                                ref={textareaRef}
                                rows={4}
                                value={message}
                                onChange={e => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                                placeholder="Hi, I want to know more about your services 👋"
                                className="w-full resize-none rounded-xl border border-gray-200 bg-white/90 px-3.5 py-3 text-[13px] text-gray-800 placeholder-gray-400 leading-relaxed outline-none transition-all focus:border-[#25D366] focus:ring-2 focus:ring-[#25D366]/20 hover:border-gray-300"
                            />
                        </div>

                        {/* ── Generate + Output Card ── */}
                        <div className="rounded-2xl border border-gray-200/70 bg-white/90 backdrop-blur-sm p-5 shadow-sm ring-1 ring-gray-100/50">
                            <div className="mb-3.5 flex items-center gap-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-[10px] font-bold text-gray-500">3</div>
                                <h2 className="text-[13px] font-bold text-gray-900">Generate Link</h2>
                            </div>

                            <button
                                type="button"
                                onClick={handleGenerate}
                                disabled={!phone}
                                className="group relative w-full overflow-hidden rounded-xl py-3 text-sm font-bold text-white shadow-lg shadow-green-500/20 transition-all hover:shadow-xl hover:shadow-green-500/30 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                                style={{ background: phone ? 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)' : '#9ca3af' }}
                            >
                                {/* Shine sweep */}
                                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
                                <span className="relative flex items-center justify-center gap-2">
                                    <Zap className="h-4 w-4" />
                                    Generate Link
                                </span>
                            </button>

                            {/* Generated output */}
                            {generatedLink && (
                                <div className="mt-4 space-y-3">
                                    <div className="rounded-xl border border-[#25D366]/20 bg-gradient-to-br from-[#f0fdf4] to-[#ecfdf5] p-3.5">
                                        <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#16a34a]">
                                            <CheckCircle2 className="h-3 w-3" /> Generated
                                        </p>
                                        <p className="truncate font-mono text-[11px] text-gray-600" title={generatedLink}>
                                            {decodeURIComponent(generatedLink)}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={handleCopyLink}
                                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[12px] font-semibold transition-all active:scale-95 ${linkCopied ? 'border-[#25D366]/30 bg-[#f0fdf4] text-[#16a34a]' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 shadow-sm'}`}
                                        >
                                            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                            {linkCopied ? 'Copied!' : 'Copy Link'}
                                        </button>
                                        <a
                                            href={generatedLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-95"
                                        >
                                            <ArrowUpRight className="h-3.5 w-3.5 text-[#25D366]" />
                                            Open
                                        </a>
                                        <button
                                            type="button"
                                            onClick={handleShare}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-95"
                                        >
                                            <Share2 className="h-3.5 w-3.5" />
                                            Share
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Live preview before generate */}
                            {!generatedLink && liveLink && (
                                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/80 p-3.5">
                                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">Preview</p>
                                    <p className="truncate font-mono text-[11px] text-gray-500" title={liveLink}>
                                        {decodeURIComponent(liveLink)}
                                    </p>
                                </div>
                            )}

                            {/* Share row — shown when link is ready */}
                            {liveLink && (
                                <div className="mt-4 border-t border-gray-100 pt-4">
                                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Share To</p>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { label: 'Instagram', icon: Instagram, style: 'text-pink-600 border-pink-100 bg-pink-50 hover:bg-pink-100', url: `https://www.instagram.com/` },
                                            { label: 'Facebook', icon: Facebook, style: 'text-blue-600 border-blue-100 bg-blue-50 hover:bg-blue-100', url: `https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(liveLink)}` },
                                            { label: 'Twitter', icon: Twitter, style: 'text-sky-500 border-sky-100 bg-sky-50 hover:bg-sky-100', url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(liveLink)}` },
                                            { label: 'YouTube', icon: Youtube, style: 'text-red-600 border-red-100 bg-red-50 hover:bg-red-100', url: `https://youtube.com/` },
                                            { label: 'Copy', icon: Copy, style: 'text-gray-600 border-gray-200 bg-gray-50 hover:bg-gray-100', action: handleCopyLink },
                                            { label: 'More', icon: Share2, style: 'text-emerald-600 border-emerald-100 bg-emerald-50 hover:bg-emerald-100', action: handleShare },
                                        ].map(({ label, icon: Icon, style, url, action }) =>
                                            url ? (
                                                <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all hover:scale-105 active:scale-95 ${style}`}>
                                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                                    {label}
                                                </a>
                                            ) : (
                                                <button key={label} type="button" onClick={action}
                                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all hover:scale-105 active:scale-95 ${style}`}>
                                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                                    {label}
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ════ RIGHT — PREVIEW ════ */}
                    <div className="lg:w-[300px] xl:w-[320px] shrink-0 space-y-4">
                        <div className="rounded-2xl border border-gray-200/70 bg-white/90 backdrop-blur-sm p-5 shadow-sm ring-1 ring-gray-100/50">
                            <div className="mb-1 flex items-center justify-between">
                                <div>
                                    <h2 className="text-[13px] font-bold text-gray-900">Live Preview</h2>
                                    <p className="text-[11px] text-gray-400 mt-0.5">Updates instantly as you type</p>
                                </div>
                                {/* Online pulse */}
                                <div className="flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="absolute inline-flex h-full w-full rounded-full bg-[#25D366] opacity-75 animate-ping" />
                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#25D366]" />
                                    </span>
                                    <span className="text-[10px] font-semibold text-[#25D366]">LIVE</span>
                                </div>
                            </div>

                            <div className="mt-4">
                                <PhonePreview
                                    phoneNumber={sanitizedPhone}
                                    message={message}
                                    countryDial={selectedCountry.dial}
                                />
                            </div>

                            {liveLink && (
                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    className={`mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-semibold transition-all active:scale-95 ${linkCopied ? 'border-[#25D366]/30 bg-[#f0fdf4] text-[#16a34a]' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm'}`}
                                >
                                    {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    {linkCopied ? 'Link Copied!' : 'Copy Link'}
                                </button>
                            )}
                        </div>



                    </div>
                </div>

                {/* ── ACCORDION SECTIONS ── */}
                <div className="mt-6 space-y-2.5">
                    <Accordion title="How It Works — 3 Simple Steps" icon={Zap}>
                        <ol className="space-y-3">
                            {[
                                { n: '1', title: 'Enter Your WhatsApp Number', body: 'Select your country code and type the WhatsApp number where you want to receive messages.' },
                                { n: '2', title: 'Add a Custom Message', body: 'Write a pre-filled message that users see when they open your link. Keep it friendly.' },
                                { n: '3', title: 'Generate & Share', body: 'Click Generate Link, copy the URL, share anywhere — social bio, ads, QR, email.' },
                            ].map(({ n, title, body }) => (
                                <li key={n} className="flex gap-3">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#25D366] to-[#128C7E] text-[10px] font-bold text-white shadow-sm">{n}</span>
                                    <div>
                                        <p className="font-semibold text-gray-800">{title}</p>
                                        <p className="mt-0.5 text-gray-500">{body}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </Accordion>

                    <Accordion title="Use Cases — Where to Share Your Link" icon={Globe}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                { icon: Globe, title: 'Social Media Bio', body: 'Add to Instagram, Twitter, LinkedIn bios for direct conversations.' },
                                { icon: Instagram, title: 'Instagram Story', body: 'Paste the link in your Story and save to Highlights for permanent visibility.' },
                                { icon: ShoppingBag, title: 'Sales & E-commerce', body: 'Drive product inquiries directly to WhatsApp for faster conversions.' },
                                { icon: Headphones, title: 'Customer Support', body: 'Replace contact forms with a direct WhatsApp link for instant support.' },
                            ].map(({ icon: Icon, title, body }) => (
                                <div key={title} className="flex gap-2.5 rounded-xl bg-gray-50 p-3">
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white border border-gray-100 shadow-sm">
                                        <Icon className="h-3.5 w-3.5 text-[#25D366]" />
                                    </div>
                                    <div>
                                        <p className="text-[12px] font-semibold text-gray-800">{title}</p>
                                        <p className="mt-0.5 text-[11px] text-gray-500">{body}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Accordion>

                    <Accordion title="Benefits of WhatsApp Click-to-Chat" icon={CheckCircle2}>
                        <ul className="space-y-2">
                            {[
                                'Faster conversion — one tap starts a chat, no number saving needed.',
                                'Pre-filled messages reduce friction and improve response rates.',
                                'Works in bios, ads, emails, QR codes, and websites.',
                                'Contact saved automatically when users message you.',
                                'No app needed for sharing — just a URL anyone can click.',
                            ].map((b, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#25D366]" />
                                    <span>{b}</span>
                                </li>
                            ))}
                        </ul>
                    </Accordion>
                </div>

            </div>
        </div>
    )
}
