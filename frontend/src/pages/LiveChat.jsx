import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, MoreVertical, Paperclip, Send, Smile, Phone, Tag, Check, CheckCheck, Clock, AlertCircle, Info, ChevronLeft, ArrowDown, FileText, Mic, Pencil, Bot, User } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { io } from "socket.io-client";
import QRCode from 'react-qr-code'
import { useAuth } from '../context/AuthContext'
import ContactProfileDrawer from '../components/ContactProfileDrawer'
import { AudioPlayerProvider } from '../components/AudioPlayerManager'
import AudioMessageBubble from '../components/AudioMessageBubble'
import AudioRecorderOrUploader from '../components/AudioRecorderOrUploader'

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

// Connect to backend
const socket = io(BACKEND_BASE, {
    transports: ['websocket', 'polling'],
});
const API_BASE = `${BACKEND_BASE}/api`;

export default function LiveChat() {
    const { user, session } = useAuth()
    const [chats, setChats] = useState([])
    const chatsRef = useRef([])
    const [selectedChat, setSelectedChat] = useState(null)
    const selectedChatRef = useRef(null)
    const [messageText, setMessageText] = useState('')
    const [isInternalNote, setIsInternalNote] = useState(false)
    const [messages, setMessages] = useState([])
    const messagesEndRef = useRef(null)
    const messagesListRef = useRef(null)

    const [hasMoreMessages, setHasMoreMessages] = useState(true)
    const [isLoadingOlder, setIsLoadingOlder] = useState(false)
    const [newMessagesPending, setNewMessagesPending] = useState(0)
    const [activeVideoId, setActiveVideoId] = useState(null)

    const fileInputRef = useRef(null)
    const [selectedFile, setSelectedFile] = useState(null)
    const [pendingAudio, setPendingAudio] = useState(null) // { file: File, durationSeconds: number }
    const [isAudioPanelOpen, setIsAudioPanelOpen] = useState(false)
    const [isEmojiOpen, setIsEmojiOpen] = useState(false)
    const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false)
    const [focusAliasOnOpen, setFocusAliasOnOpen] = useState(false)

    // Bot state
    const [botEnabled, setBotEnabled] = useState(false)
    const [availableBots, setAvailableBots] = useState([])
    const [selectedBotId, setSelectedBotId] = useState(null)
    const [showBotMenu, setShowBotMenu] = useState(false)

    // Connection State
    const [isConnected, setIsConnected] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [connectionStatus, setConnectionStatus] = useState('Connecting...');

    // Team members for assignment
    const [teamMembers, setTeamMembers] = useState([])

    useEffect(() => {
        chatsRef.current = chats
    }, [chats])

    useEffect(() => {
        selectedChatRef.current = selectedChat
    }, [selectedChat])

    // Close bot menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (showBotMenu && !e.target.closest('[data-bot-menu]')) {
                setShowBotMenu(false)
            }
        }
        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [showBotMenu])

    const isNearBottom = () => {
        const el = messagesListRef.current
        if (!el) return true
        const threshold = 150
        return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold
    }

    const scrollToBottom = (behavior = 'auto') => {
        messagesEndRef.current?.scrollIntoView({ behavior })
    }

    // Account Selection
    const [connectedAccounts, setConnectedAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('All');

    const normalizeAccountKey = (value) => String(value || '').replace(/[^0-9]/g, '')

    const normalizeId = (value) => {
        if (value == null) return ''
        return String(value)
    }

    const idsEqual = (a, b) => normalizeId(a) !== '' && normalizeId(a) === normalizeId(b)

    const normalizeIndianPhoneKey = (value) => {
        const raw = String(value || '')
        const left = raw.includes('@') ? raw.split('@')[0] : raw
        const digits = left.replace(/[^0-9]/g, '')
        if (digits.length === 10) return `91${digits}`
        if (digits.length === 12 && digits.startsWith('91')) return digits
        return null
    }

    const formatPhoneForDisplay = (value) => {
        const raw = String(value || '')
        if (!raw) return ''

        const [left, right] = raw.includes('@') ? raw.split('@') : [raw, '']

        // Never display internal identifiers (e.g. @lid, @g.us, @newsletter) as "phone".
        // Only allow @s.whatsapp.net or no domain because left side is a phone.
        if (right && right !== 's.whatsapp.net') return ''

        const digits = String(left).replace(/[^0-9]/g, '')
        if (!digits) return ''

        // Indian numbers: 10 digits (local) or 12 digits starting with 91
        if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
        if (digits.length === 12 && digits.startsWith('91')) {
            const local = digits.slice(2)
            return `+91 ${local.slice(0, 5)} ${local.slice(5)}`
        }

        // Other international numbers: show with + prefix, space after country code
        if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
        return ''
    }

    const getDisplayName = (contact) => {
        const custom = String(contact?.custom_name || '').trim()
        if (custom) return custom

        // Prefer saved contact name, but never show raw provider identifiers.
        const rawName = String(contact?.name || '').trim()
        let safeName = rawName && !rawName.includes('@') ? rawName : ''
        // If "name" is only digits, it’s effectively just an id/phone; don't show it as a name.
        if (safeName && /^\d+$/.test(safeName)) safeName = ''

        const raw = safeName || contact?.phone || contact?.wa_id || ''
        if (!raw) return 'Unknown'

        // If it's a JID, prefer the left side as display.
        if (raw.includes('@')) {
            const [left, right] = raw.split('@')
            if (right === 'g.us') return contact?.name || `Group ${left}`
            if (right === 'newsletter') return contact?.name || `Channel ${left}`
            // lid / s.whatsapp.net / other internal ids
            const digits = String(left).replace(/[^0-9]/g, '')
            return safeName || (digits || left)
        }

        if (!safeName) {
            const phone = formatPhoneForDisplay(contact?.phone || contact?.wa_id || '')
            return phone || 'Unknown'
        }

        return raw
    }

    const displayFromWaId = (wa) => {
        const raw = String(wa || '')
        if (!raw) return ''
        const left = raw.includes('@') ? raw.split('@')[0] : raw
        const digits = left.replace(/[^0-9]/g, '')
        return digits || left
    }

    const getAvatarText = (name) => {
        const safe = String(name || '').trim()
        if (!safe) return '?'
        const parts = safe.split(/\s+/).filter(Boolean)
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
        return safe.slice(0, 2).toUpperCase()
    }

    const avatarColorClass = (seed) => {
        const colors = [
            'bg-indigo-500',
            'bg-sky-500',
            'bg-emerald-500',
            'bg-amber-500',
            'bg-rose-500',
            'bg-violet-500',
            'bg-teal-500',
            'bg-orange-500',
        ]
        const s = String(seed || '')
        let h = 0
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
        return colors[h % colors.length]
    }

    const formatMessageFromDb = (m) => {
        const createdAt = m.created_at ? new Date(m.created_at) : new Date()

        const rawType = m.content?.rawType || null
        // Never render protocol/system/reaction rows as chat bubbles.
        if (m.type === 'protocol' || m.type === 'system' || rawType === 'protocolMessage') return null
        if (m.type === 'reaction' || rawType === 'reactionMessage') return null
        // Legacy DB rows (pre-fix) stored stickers as text placeholders.
        if (rawType === 'stickerMessage' && m.type !== 'sticker') return null

        const captionOrText = (m.text_body ?? m.content?.caption ?? m.content?.text ?? '')

        const mediaUrl = m.media_url ?? m.content?.media_url ?? null
        const mimeType = m.media_mime ?? m.content?.mime_type ?? null
        const fileName = m.content?.file_name ?? null
        const durationSeconds = m.duration_seconds ?? m.content?.duration_seconds ?? null

        return {
            id: m.id,
            wa_message_id: m.wa_message_id,
            createdAt,
            text: typeof captionOrText === 'string' ? captionOrText : String(captionOrText || ''),
            mediaUrl,
            mimeType,
            fileName,
            durationSeconds: Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : null,
            sender: m.direction === 'outbound' ? 'agent' : 'user',
            time: format(createdAt, 'h:mm a'),
            type: m.type === 'note' ? 'note' : (m.type || 'text'),
            messageType: m.type || 'text',
            agentName: m.direction === 'outbound' ? 'You' : null,
            account: null,
            status: m.status,
            reactions: Array.isArray(m.reactions) ? m.reactions : [],
        }
    }

    const insertEmoji = (emoji) => {
        setMessageText((prev) => `${prev || ''}${emoji}`)
        setIsEmojiOpen(false)
    }

    const fetchChats = async () => {
        if (!session?.access_token) return;
        try {
            // Pass current WA Account filter if selected
            let url = `${API_BASE}/conversations`;
            if (user?.id) url += `?user_id=${user.id}`;
            if (selectedAccount !== 'All') {
                url += `${url.includes('?') ? '&' : '?'}wa_account_id=${selectedAccount}`; // In real app, pass ID not name
            }

            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const formatted = data.map(conv => ({
                    id: conv.id, // Conversation ID
                    contactId: conv.contact?.id,
                    name: getDisplayName(conv.contact),
                    phone: conv.contact?.phone,
                    waId: conv.contact?.wa_id,
                    contact: conv.contact || null,
                    lastMessage: conv.last_message_preview || 'No messages',
                    lastMessageAt: conv.last_message_at ? new Date(conv.last_message_at) : null,
                    time: conv.last_message_at ? format(new Date(conv.last_message_at), 'h:mm a') : '',
                    // Prefer computed unread (based on message read status) over the legacy global counter.
                    unread: Number.isFinite(Number(conv.unread_for_user)) ? Number(conv.unread_for_user) : (Number(conv.unread_count) || 0),
                    // Derive read state from unread count to keep the badge correct.
                    userHasRead: (Number.isFinite(Number(conv.unread_for_user)) ? Number(conv.unread_for_user) : (Number(conv.unread_count) || 0)) === 0,
                    status: conv.status,
                    tags: conv.labels || [],
                    assigned_to: conv.assigned_to,
                    type: 'text'
                }));
                // Sort by time (newest first)
                formatted.sort((a, b) => {
                    const aTime = a.lastMessageAt ? a.lastMessageAt.getTime() : 0;
                    const bTime = b.lastMessageAt ? b.lastMessageAt.getTime() : 0;
                    return bTime - aTime;
                });
                setChats(formatted);
            } else {
                const body = await res.text().catch(() => '')
                console.error('Failed to fetch chats:', res.status, body)
            }
        } catch (e) {
            console.error("Failed to fetch chats", e);
        }
    };

    // Fetch available bot agents
    const fetchBots = async () => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_BASE}/agents`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAvailableBots(data.filter(bot => bot.is_active));
            }
        } catch (e) {
            console.error("Failed to fetch bots", e);
        }
    };

    // Fetch bot status for current conversation
    const fetchConversationBotStatus = async (conversationId) => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_BASE}/conversations`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const conv = data.find(c => c.id === conversationId);
                if (conv) {
                    setBotEnabled(conv.bot_enabled || false);
                    setSelectedBotId(conv.assigned_bot_id || null);
                }
            }
        } catch (e) {
            console.error("Failed to fetch bot status", e);
        }
    };

    // Toggle bot for current conversation
    const toggleBotForConversation = async (enabled, botId = null) => {
        if (!selectedChat || !session?.access_token) return;
        
        try {
            const res = await fetch(`${API_BASE}/conversations/${selectedChat.id}/bot`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ 
                    bot_enabled: enabled,
                    assigned_bot_id: botId
                })
            });

            if (res.ok) {
                setBotEnabled(enabled);
                setSelectedBotId(botId);
                setShowBotMenu(false);
            }
        } catch (e) {
            console.error("Failed to toggle bot", e);
        }
    };

    const fetchTeamMembers = async () => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_BASE}/team/members`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data);
            }
        } catch (err) {
            console.error("Failed to fetch team members:", err);
        }
    };

    const assignAgent = async (conversationId, agentId) => {
        if (!session?.access_token) return;
        try {
            const res = await fetch(`${API_BASE}/conversations/${conversationId}/assign`, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ agent_id: agentId || null })
            });
            if (res.ok) {
                setChats(prev => prev.map(c => 
                    c.id === conversationId ? { ...c, assigned_to: agentId } : c
                ));
                if (selectedChat?.id === conversationId) {
                    setSelectedChat(prev => ({ ...prev, assigned_to: agentId }));
                }
            }
        } catch (err) {
            console.error("Failed to assign agent:", err);
        }
    };

    const getAgentName = (agentId) => {
        if (!agentId) return 'Unassigned';
        const member = teamMembers.find(m => m.user_id === agentId);
        return member ? member.name : 'Unknown Agent';
    };

    useEffect(() => {
        if (session?.access_token) {
            fetchTeamMembers();
        }
    }, [session]);


    const fetchMessages = async (chat, opts = {}) => {
        if (!chat || !session?.access_token) return
        try {
            const limit = opts.limit || 50
            const before = opts.before || null
            const url = new URL(`${API_BASE}/messages/${chat.id}`)
            url.searchParams.set('limit', String(limit))
            if (before) url.searchParams.set('before', before)

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                console.error('Failed to fetch messages:', res.status, body)
                return
            }

            const data = await res.json().catch(() => [])
            const formatted = (Array.isArray(data) ? data : []).map(formatMessageFromDb).filter(Boolean)

            if (opts.mode === 'prepend') {
                const el = messagesListRef.current
                const prevScrollHeight = el ? el.scrollHeight : 0

                setMessages(prev => {
                    const merged = [...formatted, ...prev]
                    merged.sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0))
                    const seen = new Set()
                    return merged.filter(m => {
                        const key = m.id
                        if (seen.has(key)) return false
                        seen.add(key)
                        return true
                    })
                })

                requestAnimationFrame(() => {
                    if (!el) return
                    const nextScrollHeight = el.scrollHeight
                    const delta = nextScrollHeight - prevScrollHeight
                    el.scrollTop = el.scrollTop + delta
                })
            } else {
                setMessages(formatted)
                setNewMessagesPending(0)
                requestAnimationFrame(() => scrollToBottom('auto'))
            }

            setHasMoreMessages(formatted.length >= limit)
        } catch (e) {
            console.error('Failed to fetch messages', e)
        }
    }

    useEffect(() => {
        fetchChats();
        fetchBots(); // Also fetch available bots
        
        // Fetch Meta Cloud API connected accounts from the database
        const fetchMetaAccounts = async () => {
            if (!session?.access_token) return;
            try {
                const res = await fetch(`${API_BASE}/whatsapp/accounts`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        setIsConnected(true);
                        setConnectedAccounts(prev => {
                            const newAccounts = [...prev];
                            data.forEach(acc => {
                                // Meta API uses display_phone_number or phone_number_id
                                const accId = acc.display_phone_number || acc.phone_number_id || acc.whatsapp_business_account_id;
                                if (accId && !newAccounts.includes(accId)) {
                                    newAccounts.push(accId);
                                }
                            });
                            return newAccounts;
                        });
                    }
                }
            } catch (err) {
                console.error("Failed to fetch meta accounts:", err);
            }
        };
        fetchMetaAccounts();
    }, [user, session, selectedAccount]); // Re-fetch when user loads/filters/connects

    useEffect(() => {
        if (!selectedChat) {
            setBotEnabled(false);
            setSelectedBotId(null);
            return;
        }

        fetchMessages(selectedChat, { limit: 50 })
        fetchConversationBotStatus(selectedChat.id) // Fetch bot status for this conversation

        // Optimistically clear unread badge immediately when opening a chat.
        setChats(prev => prev.map(c => c.id === selectedChat.id ? { ...c, userHasRead: true, unread: 0 } : c))

        const t = setTimeout(() => {
            if (!session?.access_token) return;
            const payload = user?.id ? { user_id: user.id } : {}
            fetch(`${API_BASE}/conversations/${selectedChat.id}/read`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify(payload)
            }).catch(() => undefined)
        }, 300)

        return () => clearTimeout(t)
    }, [selectedChat]);

    const loadOlder = async () => {
        if (!selectedChat || isLoadingOlder || !hasMoreMessages) return
        const oldest = messages[0]
        if (!oldest?.createdAt) return

        setIsLoadingOlder(true)
        try {
            await fetchMessages(selectedChat, {
                mode: 'prepend',
                limit: 50,
                before: oldest.createdAt.toISOString(),
            })
        } finally {
            setIsLoadingOlder(false)
        }
    }

    // Socket Listener
    useEffect(() => {
        const handleConnect = () => {
            // Socket transport is separate from WA connection state; keep logs minimal.
            console.log('[socket] connected', socket.id)
        }

        const handleConnectError = (err) => {
            console.error('[socket] connect_error', err?.message || err)
        }

        const handleNewMessage = (msg) => {
            if (msg?.type === 'reaction' || msg?.type === 'protocol' || msg?.type === 'system') return

            const convId = msg?.conversation_id
            const createdAt = msg?.created_at ? new Date(msg.created_at) : new Date()

            const activeChat = selectedChatRef.current

            const conversationExists = convId ? chatsRef.current.some(c => idsEqual(c?.id, convId)) : true

            const pageFocused = typeof document !== 'undefined'
                ? (!document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true))
                : true

            if (convId) {
                setChats(prev => {
                    const copy = [...prev]
                    const idx = copy.findIndex(c => idsEqual(c?.id, convId))
                    if (idx < 0) {
                        const maybeName = typeof msg?.name === 'string' ? msg.name.trim() : ''
                        const usableName = (maybeName && !maybeName.includes('@') && !/^\d+$/.test(maybeName)) ? maybeName : ''
                        const display = usableName || (formatPhoneForDisplay(msg?.phone || msg?.from) || 'Unknown')
                        const createdTime = createdAt
                        const typeLabel = msg?.type ? String(msg.type) : ''
                        const preview = msg?.text || (typeLabel ? `[${typeLabel.charAt(0).toUpperCase()}${typeLabel.slice(1)}]` : 'New message')

                        const placeholder = {
                            id: convId,
                            contactId: msg?.contact_id || null,
                            name: display,
                            phone: msg?.phone || msg?.from || null,
                            waId: msg?.from || null,
                            contact: null,
                            lastMessage: preview,
                            lastMessageAt: createdTime,
                            time: format(createdTime, 'h:mm a'),
                            unread: 1,
                            userHasRead: false,
                            status: 'open',
                            tags: [],
                            assigned_to: msg?.assigned_to || null,
                            type: 'text'
                        }

                        return [placeholder, ...copy]
                    }

                    const current = copy[idx]
                    const typeLabel = msg?.type ? String(msg.type) : ''
                    const preview = msg?.text || (typeLabel ? `[${typeLabel.charAt(0).toUpperCase()}${typeLabel.slice(1)}]` : 'New message')
                    const isViewing = idsEqual(activeChat?.id, convId) && pageFocused
                    const inbound = (msg?.sender || 'user') !== 'agent'

                    // If I'm actively viewing this chat, treat inbound as read immediately.
                    const unreadInc = (inbound && !isViewing) ? 1 : 0
                    const nextUnread = isViewing ? 0 : (unreadInc ? (current.unread || 0) + 1 : (current.unread || 0))

                    const patched = {
                        ...current,
                        lastMessage: preview,
                        lastMessageAt: createdAt,
                        time: format(createdAt, 'h:mm a'),
                        unread: nextUnread,
                        userHasRead: nextUnread === 0,
                    }

                    copy.splice(idx, 1)
                    return [patched, ...copy]
                })

                // If the sidebar doesn't know this conversation yet, refresh from server
                // so we get correct name/contact/tags/unread.
                if (!conversationExists) {
                    setTimeout(() => {
                        fetchChats()
                    }, 250)
                }
            }

            // If this message belongs to currently open chat
            if (activeChat) {
                // Check match. Msg might have conversation_id or phone
                const msgPhoneKey = normalizeAccountKey(msg.phone || msg.from)
                const chatPhoneKey = normalizeAccountKey(activeChat.phone)

                const isMatch = (msg.conversation_id && idsEqual(msg.conversation_id, activeChat.id)) ||
                    (msgPhoneKey && chatPhoneKey && msgPhoneKey === chatPhoneKey) ||
                    (msg.contact_id && idsEqual(activeChat.contactId, msg.contact_id));

                if (isMatch) {
                    const newMessage = {
                        id: msg.message_id || msg.id || Date.now(),
                        wa_message_id: msg.wa_message_id || null,
                        createdAt,
                        text: msg.text || '',
                        sender: msg.sender || 'user',
                        time: format(createdAt, 'h:mm a'),
                        type: msg.type === 'note' ? 'note' : (msg.type || 'text'),
                        messageType: msg.type || 'text',
                        mediaUrl: msg.media_url || null,
                        mimeType: msg.mime_type || null,
                        fileName: msg.file_name || null,
                        durationSeconds: Number.isFinite(Number(msg.duration_seconds)) ? Number(msg.duration_seconds) : null,
                        from: msg.from,
                        account: msg.connectedAccount,
                        status: msg.status,
                        reactions: Array.isArray(msg.reactions) ? msg.reactions : [],
                    };

                    setMessages(prev => {
                        const merged = [...prev, newMessage]
                        merged.sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0))
                        const seen = new Set()
                        return merged.filter(m => {
                            const key = m.id
                            if (seen.has(key)) return false
                            seen.add(key)
                            return true
                        })
                    });

                    const nearBottom = isNearBottom()

                    // Only mark read when the user is actually looking at the latest messages.
                    if (user?.id && nearBottom && pageFocused && session?.access_token) {
                        setTimeout(() => {
                            fetch(`${API_BASE}/conversations/${activeChat.id}/read`, {
                                method: 'POST',
                                headers: { 
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${session.access_token}`
                                },
                                body: JSON.stringify({ user_id: user.id })
                            }).catch(() => undefined)
                        }, 250)
                    }

                    if (nearBottom) {
                        requestAnimationFrame(() => scrollToBottom('smooth'))
                        setNewMessagesPending(0)
                    } else {
                        setNewMessagesPending((n) => n + 1)
                    }
                } else if (msg?.conversation_id && idsEqual(msg.conversation_id, activeChat.id)) {
                    // Fallback: if the server emitted a message for the active conversation but our match logic missed,
                    // re-fetch to keep UI in sync.
                    setTimeout(() => {
                        fetchMessages(activeChat)
                    }, 150)
                }
            }
        };

        const handleContactUpdated = (payload) => {
            const updated = payload?.contact
            if (!updated) return

            setChats(prev => prev.map(c => {
                const sameById = updated?.id && idsEqual(c?.contactId, updated.id)
                const sameByWa = updated?.wa_id && String(c?.waId || '') === String(updated.wa_id)
                if (!sameById && !sameByWa) return c

                const nextContact = { ...(c.contact || {}), ...updated }
                return {
                    ...c,
                    contactId: updated?.id || c.contactId,
                    waId: updated?.wa_id || c.waId,
                    phone: updated?.phone || c.phone,
                    contact: nextContact,
                    name: getDisplayName(nextContact),
                }
            }))

            const active = selectedChatRef.current
            if (active && updated?.id && idsEqual(active?.contactId, updated.id)) {
                setSelectedChat(prev => {
                    if (!prev) return prev
                    const nextContact = { ...(prev.contact || {}), ...updated }
                    return {
                        ...prev,
                        contactId: updated?.id || prev.contactId,
                        waId: updated?.wa_id || prev.waId,
                        phone: updated?.phone || prev.phone,
                        contact: nextContact,
                        name: getDisplayName(nextContact),
                    }
                })
            }
        }

        socket.on('connect', handleConnect)
        socket.on('connect_error', handleConnectError)

        socket.on('new_message', handleNewMessage);
        socket.on('contact_updated', handleContactUpdated)

        socket.on('message_updated', (update) => {
            const targetId = update?.message_id || null
            const targetWaId = update?.wa_message_id || null
            const nextReactions = Array.isArray(update?.reactions) ? update.reactions : null
            if (!nextReactions) return

            setMessages(prev => prev.map(m => {
                const match = (targetId && m.id === targetId) || (targetWaId && m.wa_message_id && m.wa_message_id === targetWaId)
                return match ? { ...m, reactions: nextReactions } : m
            }))
        })

        socket.on('message_status_update', (update) => {
            console.log("Status update received:", update);
            setMessages(prev => prev.map(m =>
                (m.wa_message_id && m.wa_message_id === update.wa_message_id)
                    ? { ...m, status: update.status }
                    : m
            ));
        });

        socket.on('connected_account', (account) => {
            console.log("Account connected:", account);
            setIsConnected(true);
            setConnectedAccounts(prev => {
                if (!prev.includes(account)) return [...prev, account];
                return prev;
            });
        });

        socket.on('qr', (qr) => {
            console.log("QR Code received");
            setQrCode(qr);
            setIsConnected(false);
            setConnectionStatus('Scan QR Code');
        });

        socket.on('status', (status) => {
            console.log("Status update:", status);
            setConnectionStatus(status);
            if (status === 'connected') {
                setIsConnected(true);
                setQrCode('');
            } else if (status === 'connecting') {
                // Keep current state
            } else {
                setIsConnected(false);
            }
        });

        socket.on('session_not_found', () => {
            // Do not auto-request QR here. Only request when user clicks "Generate QR Code".
            console.log("Session not found. Waiting for user to request QR.");
            setIsConnected(false);
            setQrCode('');
            setConnectedAccounts([]);
            setConnectionStatus('idle');
        });

        // Initialize Session (join once)
        let sessionId = localStorage.getItem('whatsapp_session_id');
        if (!sessionId) {
            sessionId = 'dashboard_session'; // Persistent default session
            localStorage.setItem('whatsapp_session_id', sessionId);
        }
        socket.emit('join_session', sessionId);

        return () => {
            socket.off('connect', handleConnect)
            socket.off('connect_error', handleConnectError)
            socket.off('new_message', handleNewMessage);
            socket.off('contact_updated', handleContactUpdated)
            socket.off('message_updated');
            socket.off('message_status_update');
            socket.off('connected_account');
            socket.off('qr');
            socket.off('status');
            socket.off('session_not_found');
        };
    }, []);

    const renderReactionsPill = (msg) => {
        const list = Array.isArray(msg?.reactions) ? msg.reactions : []
        if (list.length === 0) return null

        const counts = new Map()
        for (const r of list) {
            const emoji = r?.emoji
            if (!emoji) continue
            counts.set(emoji, (counts.get(emoji) || 0) + 1)
        }
        if (counts.size === 0) return null

        return (
            <div className="mt-1 flex justify-end">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 border border-gray-200 shadow-sm text-[11px] text-gray-800">
                    {[...counts.entries()].slice(0, 6).map(([emoji, count]) => (
                        <span key={emoji} className="leading-none">
                            {emoji}{count > 1 ? <span className="text-[10px] text-gray-500 ml-0.5">{count}</span> : null}
                        </span>
                    ))}
                </div>
            </div>
        )
    }

    const handleSendMessage = async (e) => {
        e.preventDefault()
        if (!messageText.trim() && !selectedFile) return

        // Internal notes are UI-only for now
        if (isInternalNote) {
            const newMessage = {
                id: Date.now(),
                text: messageText,
                sender: 'system',
                time: format(new Date(), 'h:mm a'),
                type: 'note',
                agentName: 'You'
            }
            setMessages(prev => [...prev, newMessage])
            setMessageText('')
            return
        }

        if (!selectedChat) return

        // Audio send
        if (pendingAudio?.file) {
            const optimisticId = Date.now()
            const optimisticMessage = {
                id: optimisticId,
                text: messageText,
                sender: 'agent',
                time: format(new Date(), 'h:mm a'),
                type: 'audio',
                messageType: 'audio',
                mediaUrl: URL.createObjectURL(pendingAudio.file),
                mimeType: pendingAudio.file.type,
                fileName: pendingAudio.file.name,
                durationSeconds: pendingAudio.durationSeconds,
                agentName: 'You',
                status: 'sent'
            }
            setMessages(prev => [...prev, optimisticMessage])

            const captionToSend = messageText
            setMessageText('')
            setPendingAudio(null)
            setIsAudioPanelOpen(false)

            try {
                const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session'
                const form = new FormData()
                form.append('conversation_id', selectedChat.id)
                form.append('file', pendingAudio.file)
                if (captionToSend) form.append('caption', captionToSend)
                form.append('session_id', sessionId)
                if (Number.isFinite(Number(pendingAudio.durationSeconds))) {
                    form.append('duration_seconds', String(Math.round(Number(pendingAudio.durationSeconds))))
                }

                const res = await fetch(`${API_BASE}/messages/audio`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session?.access_token}` },
                    body: form,
                })

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err?.error || 'Failed to send audio')
                }

                await fetchMessages(selectedChat)
                await fetchChats()
            } catch (err) {
                console.error('Send audio failed:', err)
                setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'failed' } : m))
            }
            return
        }

        // Media send
        if (selectedFile) {
            const optimisticId = Date.now()
            const derivedType = selectedFile.type?.startsWith('image/') ? 'image'
                : selectedFile.type?.startsWith('video/') ? 'video'
                    : selectedFile.type?.startsWith('audio/') ? 'audio'
                        : 'document'

            const optimisticMessage = {
                id: optimisticId,
                text: messageText,
                sender: 'agent',
                time: format(new Date(), 'h:mm a'),
                type: derivedType,
                messageType: derivedType,
                mediaUrl: URL.createObjectURL(selectedFile),
                mimeType: selectedFile.type,
                fileName: selectedFile.name,
                agentName: 'You',
                status: 'sent'
            }
            setMessages(prev => [...prev, optimisticMessage])

            const captionToSend = messageText
            setMessageText('')
            setSelectedFile(null)

            try {
                const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session'
                const form = new FormData()
                form.append('file', selectedFile)
                form.append('caption', captionToSend)
                form.append('session_id', sessionId)

                const res = await fetch(`${API_BASE}/conversations/${selectedChat.id}/send-media`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${session?.access_token}` },
                    body: form,
                })

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}))
                    throw new Error(err?.error || 'Failed to send media')
                }

                await fetchMessages(selectedChat)
                await fetchChats()
            } catch (err) {
                console.error('Send media failed:', err)
                setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'failed' } : m))
            }
            return
        }

        // Optimistic UI
        const optimisticId = Date.now()
        const optimisticMessage = {
            id: optimisticId,
            text: messageText,
            sender: 'agent',
            time: format(new Date(), 'h:mm a'),
            type: 'text',
            agentName: 'You',
            status: 'sent'
        }
        setMessages(prev => [...prev, optimisticMessage])
        const textToSend = messageText
        setMessageText('')

        try {
            const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session'
            const res = await fetch(`${API_BASE}/conversations/${selectedChat.id}/send`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({ text: textToSend, session_id: sessionId })
            })

            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err?.error || 'Failed to send')
            }

            // Refresh messages + conversation list (server is source of truth)
            await fetchMessages(selectedChat)
            await fetchChats()
        } catch (err) {
            console.error('Send failed:', err)
            // Mark as failed
            setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'failed' } : m))
        }
    }

    const renderMessageBody = (msg) => {
        const t = msg.messageType || (msg.sender === 'agent' ? 'text' : 'text')

        const resolvedUrl = msg.mediaUrl
            ? (String(msg.mediaUrl).startsWith('http') ? msg.mediaUrl : `${BACKEND_BASE}${msg.mediaUrl}`)
            : null

        if (resolvedUrl) {
            if (t === 'sticker') {
                const mime = String(msg.mimeType || '')
                if (mime.startsWith('video/')) {
                    return (
                        <div className="space-y-2">
                            <video
                                src={resolvedUrl}
                                className="h-36 w-36 rounded-lg"
                                muted
                                loop
                                playsInline
                                autoPlay
                            />
                        </div>
                    )
                }

                return (
                    <div className="space-y-2">
                        <img
                            src={resolvedUrl}
                            alt={msg.fileName || 'Sticker'}
                            className="h-36 w-36 object-contain"
                            loading="lazy"
                        />
                    </div>
                )
            }

            if (t === 'image') {
                return (
                    <div className="space-y-2">
                        <img
                            src={resolvedUrl}
                            alt={msg.fileName || 'Image'}
                            className="max-h-64 w-auto rounded-lg border border-gray-200"
                            loading="lazy"
                        />
                        {msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null}
                    </div>
                )
            }

            if (t === 'video') {
                return (
                    <div className="space-y-2">
                        <video
                            src={resolvedUrl}
                            controls
                            className="max-h-64 w-auto rounded-lg border border-gray-200"
                        />
                        {msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null}
                    </div>
                )
            }

            if (t === 'audio') {
                return (
                    <div className="space-y-2">
                        <AudioMessageBubble
                            id={msg.id}
                            mediaUrl={resolvedUrl}
                            durationSeconds={msg.durationSeconds}
                            isMine={msg.sender === 'agent'}
                            status={msg.status}
                        />
                        {msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null}
                    </div>
                )
            }

            // document
            return (
                <div className="space-y-2">
                    <a
                        href={resolvedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-indigo-700 underline break-all"
                    >
                        {msg.fileName || 'Document'}
                    </a>
                    {msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null}
                </div>
            )
        }

        return msg.text ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p> : null
    }

    const filteredMessages = messages.filter(msg => {
        if (selectedAccount === 'All') return true
        if (!msg.account) return true
        return normalizeAccountKey(msg.account) === normalizeAccountKey(selectedAccount)
    });

    const renderedThread = useMemo(() => {
        const items = []
        let lastDayKey = null
        let lastMsg = null

        for (const msg of filteredMessages) {
            const dt = msg.createdAt ? new Date(msg.createdAt) : null
            const dayKey = dt ? format(dt, 'yyyy-MM-dd') : 'unknown'

            if (dayKey !== lastDayKey) {
                let label = '—'
                if (dt) {
                    if (isToday(dt)) label = 'Today'
                    else if (isYesterday(dt)) label = 'Yesterday'
                    else label = format(dt, 'dd MMM yyyy')
                }
                items.push({ kind: 'separator', key: `sep-${dayKey}`, label })
                lastDayKey = dayKey
                lastMsg = null
            }

            const gapMs = lastMsg?.createdAt && msg.createdAt ? (msg.createdAt.getTime() - lastMsg.createdAt.getTime()) : 999999
            const sameSender = lastMsg && lastMsg.sender === msg.sender
            const grouped = sameSender && gapMs < 2 * 60 * 1000 && lastMsg.type !== 'note' && msg.type !== 'note'

            items.push({ kind: 'message', key: msg.id, msg, grouped })
            lastMsg = msg
        }

        return items
    }, [filteredMessages]);

    const requestFreshQr = () => {
        const sessionId = localStorage.getItem('whatsapp_session_id') || 'dashboard_session';
        socket.emit('request_qr', sessionId);
    };

    // Render Simplified Connect Prompt if no accounts connected
    if (!isConnected && connectedAccounts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-theme(spacing.28))] bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
                <div className="bg-green-50 p-4 rounded-full mb-4">
                    <Phone className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Connect your WhatsApp account for live chat</h2>
                <p className="text-gray-500 mb-6 max-w-sm text-sm">You need an active WhatsApp connection to send and receive messages in real-time.</p>
                <a 
                    href="/whatsapp-connect"
                    className="px-6 py-2.5 bg-[#25D366] text-white rounded-xl font-bold text-sm hover:bg-[#20b956] transition-all shadow-md shadow-green-100"
                >
                    Go to Connect Page
                </a>
            </div>
        );
    }

    // Render Chat Interface
    return (
        <AudioPlayerProvider>
        <div className="flex h-[calc(100vh-theme(spacing.28))] lg:h-[calc(100vh-theme(spacing.20))] -m-2 lg:-m-0 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm shadow-gray-200/50">
            {/* Left Cone: Chat List */}
            <div className={`${selectedChat ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 border-r border-gray-200 flex-col bg-white overflow-hidden`}>
                {/* Header / Account Switcher */}
                <div className="p-3 border-b border-gray-200 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inbox</label>
                        <select
                            value={selectedAccount}
                            onChange={(e) => setSelectedAccount(e.target.value)}
                            className="bg-transparent text-xs font-medium text-indigo-600 focus:outline-none cursor-pointer"
                        >
                            <option value="All">All Accounts</option>
                            {connectedAccounts.map(acc => (
                                <option key={acc} value={acc}>{acc} (Active)</option>
                            ))}
                        </select>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search chats..."
                            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {chats.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            No chats yet. Messages you receive will appear here.
                        </div>
                    ) : (
                        chats.map(chat => (
                            <div
                                key={chat.id}
                                onClick={() => setSelectedChat(chat)}
                                className={`flex items-start gap-3 p-3 lg:p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-all duration-200 ${selectedChat?.id === chat.id ? 'bg-indigo-50/60 border-indigo-100' : ''}`}
                            >
                                <div className="relative shrink-0">
                                    <div
                                        className={`h-11 w-11 rounded-full flex items-center justify-center font-bold text-lg shadow-sm text-white ${avatarColorClass(chat.name || chat.phone || chat.waId || chat.id)} ${selectedChat?.id === chat.id ? 'ring-2 ring-indigo-300 ring-offset-2 ring-offset-white' : ''}`}
                                    >
                                        {getAvatarText(chat.name)}
                                    </div>
                                    {/* Presence is not reliably available from WhatsApp APIs; hide fake online dot */}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-0.5">
                                        <h3 className={`text-sm font-semibold truncate ${selectedChat?.id === chat.id ? 'text-indigo-900' : 'text-gray-900'}`}>
                                            {chat.name}
                                        </h3>
                                        <span className="text-[10px] font-medium text-gray-400">{chat.time}</span>
                                    </div>
                                    {formatPhoneForDisplay(chat.phone || chat.waId) ? (
                                        <div className="text-[11px] text-gray-400 font-mono truncate -mt-0.5 mb-0.5">
                                            {formatPhoneForDisplay(chat.phone || chat.waId)}
                                        </div>
                                    ) : null}
                                    <p className="text-xs text-gray-500 truncate mb-1">{chat.lastMessage}</p>
                                    <div className="flex items-center gap-1.5">
                                        {chat.tags.map(tag => (
                                            <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                                {tag}
                                            </span>
                                        ))}
                                        {chat.assigned_to && (
                                            <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium bg-indigo-50 px-1.5 py-0.5 rounded" title={`Assigned to ${getAgentName(chat.assigned_to)}`}>
                                                <User className="h-3 w-3" />
                                                {getAgentName(chat.assigned_to).split(' ')[0]}
                                            </div>
                                        )}
                                        {chat.unread > 0 && (
                                            <div className="ml-auto bg-green-500 text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center shadow-sm">
                                                {chat.unread}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )))}
                </div>
            </div>

            {/* Middle Cone: Chat Area */}
            <div className={`${!selectedChat ? 'hidden lg:flex' : 'flex'} flex-1 flex-col min-w-0 bg-[#efe7dd] relative`}>
                {!selectedChat ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-4">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Send className="h-8 w-8 text-gray-300 ml-1" />
                        </div>
                        <p className="text-sm font-medium">Select a chat to start messaging</p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="h-16 px-4 bg-white border-b border-gray-200 flex items-center justify-between shrink-0 shadow-sm z-10">
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedChat(null)} className="lg:hidden p-1 -ml-1 text-gray-600">
                                    <ChevronLeft className="h-6 w-6" />
                                </button>
                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center font-semibold text-indigo-700">
                                    {getAvatarText(selectedChat?.name)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-gray-900 leading-tight">{selectedChat?.name}</h3>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFocusAliasOnOpen(true)
                                                setIsContactDrawerOpen(true)
                                            }}
                                            className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                            title="Set custom name"
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        {formatPhoneForDisplay(selectedChat?.phone || selectedChat?.waId || '')}
                                    </p>
                                </div>
                            </div>
                                <div className="flex items-center gap-3">
                                    {/* Assign Agent Dropdown */}
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-gray-400" />
                                        <select
                                            value={selectedChat?.assigned_to || ''}
                                            onChange={(e) => assignAgent(selectedChat.id, e.target.value)}
                                            className="text-xs border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                                        >
                                            <option value="">Unassigned</option>
                                            {teamMembers.map(m => (
                                                <option key={m.user_id} value={m.user_id}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Bot Toggle Button */}
                                    <div className="relative" data-bot-menu>
                                    <button
                                        onClick={() => setShowBotMenu(!showBotMenu)}
                                        className={`p-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                                            botEnabled 
                                                ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                                : 'text-gray-500 hover:bg-gray-100'
                                        }`}
                                        title={botEnabled ? 'Bot is active' : 'Enable bot'}
                                    >
                                        <Bot className="h-5 w-5" />
                                        {botEnabled && <span className="text-xs font-medium">On</span>}
                                    </button>
                                    
                                    {/* Bot Menu Dropdown */}
                                    {showBotMenu && (
                                        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
                                            <div className="p-3 border-b border-gray-100">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-medium text-gray-900">Bot Auto-Reply</span>
                                                    <button
                                                        onClick={() => toggleBotForConversation(!botEnabled, selectedBotId)}
                                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                                            botEnabled ? 'bg-green-600' : 'bg-gray-200'
                                                        }`}
                                                    >
                                                        <span
                                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                                                botEnabled ? 'translate-x-6' : 'translate-x-1'
                                                            }`}
                                                        />
                                                    </button>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {botEnabled ? 'Bot will auto-reply to messages' : 'Enable bot for this chat'}
                                                </p>
                                            </div>
                                            
                                            {botEnabled && availableBots.length > 0 && (
                                                <div className="p-2">
                                                    <p className="text-xs font-medium text-gray-500 px-2 mb-1">Select Bot</p>
                                                    {availableBots.map(bot => (
                                                        <button
                                                            key={bot.id}
                                                            onClick={() => toggleBotForConversation(true, bot.id)}
                                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                                                                selectedBotId === bot.id 
                                                                    ? 'bg-green-50 text-green-700' 
                                                                    : 'hover:bg-gray-50 text-gray-700'
                                                            }`}
                                                        >
                                                            <Bot className="h-4 w-4" />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-medium truncate">{bot.name}</div>
                                                                <div className="text-xs text-gray-500 truncate">{bot.model}</div>
                                                            </div>
                                                            {selectedBotId === bot.id && (
                                                                <Check className="h-4 w-4 text-green-600" />
                                                            )}
                                                        </button>
                                                    ))}
                                                    <button
                                                        onClick={() => toggleBotForConversation(true, null)}
                                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                                                            botEnabled && !selectedBotId 
                                                                ? 'bg-green-50 text-green-700' 
                                                                : 'hover:bg-gray-50 text-gray-700'
                                                        }`}
                                                    >
                                                        <Bot className="h-4 w-4" />
                                                        <div className="flex-1">
                                                            <div className="font-medium">Auto (Keyword Match)</div>
                                                            <div className="text-xs text-gray-500">Match by keywords</div>
                                                        </div>
                                                        {botEnabled && !selectedBotId && (
                                                            <Check className="h-4 w-4 text-green-600" />
                                                        )}
                                                    </button>
                                                </div>
                                            )}
                                            
                                            {availableBots.length === 0 && (
                                                <div className="p-3 text-center">
                                                    <p className="text-xs text-gray-500">No bots configured yet</p>
                                                    <a 
                                                        href="/bot-agents" 
                                                        className="text-xs text-green-600 hover:underline"
                                                    >
                                                        Create a bot →
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                <button
                                    onClick={() => {
                                        setFocusAliasOnOpen(false)
                                        setIsContactDrawerOpen(true)
                                    }}
                                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                                    title="Contact info"
                                >
                                    <Info className="h-5 w-5" />
                                </button>
                                <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                                    <MoreVertical className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Messages Display */}
                        <div
                            ref={messagesListRef}
                            className="flex-1 overflow-y-auto p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-[length:400px]"
                            onScroll={() => {
                                const el = messagesListRef.current
                                if (!el) return
                                if (el.scrollTop < 80) loadOlder()
                                if (isNearBottom()) setNewMessagesPending(0)
                            }}
                        >
                            {isLoadingOlder && (
                                <div className="text-center text-xs text-gray-500 mb-3">Loading older…</div>
                            )}

                            {renderedThread.map((row) => (
                                row.kind === 'separator' ? (
                                    <div key={row.key} className="flex justify-center my-3">
                                        <div className="px-3 py-1 rounded-full bg-white/70 text-gray-600 text-xs shadow-sm border border-gray-100">
                                            {row.label}
                                        </div>
                                    </div>
                                ) : (
                                    <div key={row.key} className={`flex ${row.msg.sender === 'user' ? 'justify-start' : 'justify-end'} ${row.grouped ? 'mt-1' : 'mt-3'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                        {row.msg.type === 'note' ? (
                                            <div className="w-full flex justify-center my-2">
                                                <div className="bg-amber-50 border border-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                                                    <AlertCircle className="h-3.5 w-3.5" />
                                                    <span className="font-bold">{row.msg.agentName}:</span>
                                                    {row.msg.text.replace('Internal Note: ', '')}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={`relative max-w-[85%] lg:max-w-[65%] rounded-2xl px-3 py-2 shadow-sm ${row.msg.sender === 'user'
                                                ? (row.grouped ? 'bg-white text-gray-900 border border-gray-100' : 'bg-white text-gray-900 rounded-tl-none border border-gray-100')
                                                : (row.grouped ? 'bg-[#d9fdd3] text-gray-900 border border-green-100' : 'bg-[#d9fdd3] text-gray-900 rounded-tr-none border border-green-100')
                                                }`}>
                                                {row.msg.sender === 'agent' && (
                                                    <div className="text-[10px] font-bold text-indigo-600 mb-0.5">{row.msg.agentName}</div>
                                                )}
                                                {renderMessageBody(row.msg)}
                                                {renderReactionsPill(row.msg)}
                                                <div className="text-[10px] text-gray-400/80 text-right mt-1 ml-4 flex items-center justify-end gap-1 select-none">
                                                    {row.msg.time}
                                                    {row.msg.sender === 'agent' && (
                                                        row.msg.status === 'sending' ? <Clock className="h-3 w-3 text-gray-400" /> :
                                                            row.msg.status === 'failed' ? <AlertCircle className="h-3 w-3 text-red-500" /> :
                                                                row.msg.status === 'read' ? <CheckCheck className="h-3 w-3 text-blue-500" /> :
                                                                    row.msg.status === 'delivered' ? <CheckCheck className="h-3 w-3 text-gray-400" /> :
                                                                        <Check className="h-3 w-3 text-gray-400" />
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        {newMessagesPending > 0 && (
                            <button
                                type="button"
                                onClick={() => {
                                    scrollToBottom('smooth')
                                    setNewMessagesPending(0)
                                }}
                                className="absolute bottom-20 right-5 bg-white/90 border border-gray-200 shadow-md rounded-full px-3 py-2 text-xs font-semibold text-gray-700 flex items-center gap-2"
                            >
                                <ArrowDown className="h-4 w-4" />
                                New messages ({newMessagesPending})
                            </button>
                        )}

                        {/* Input Area */}
                        <div className={`p-3 lg:p-4 bg-gray-50 border-t ${isInternalNote ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'}`}>
                            <form onSubmit={handleSendMessage} className="flex gap-3 max-w-4xl mx-auto">
                                <div className="flex gap-1 items-end pb-2">
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setIsEmojiOpen(v => !v)}
                                            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 rounded-full transition-colors"
                                            title="Emoji"
                                        >
                                            <Smile className="h-6 w-6" />
                                        </button>

                                        {isEmojiOpen && (
                                            <div className="absolute bottom-12 left-0 z-20 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-2">
                                                <div className="text-[11px] font-bold text-gray-500 mb-2">Emoji</div>
                                                <div className="grid grid-cols-8 gap-1">
                                                    {['😀','😅','😂','🙂','😉','😍','🙏','👍','❤️','🎉','😢','😡','🤝','🔥','✅','📎'].map(e => (
                                                        <button
                                                            key={e}
                                                            type="button"
                                                            onClick={() => insertEmoji(e)}
                                                            className="h-8 w-8 rounded-lg hover:bg-gray-100 text-lg"
                                                        >
                                                            {e}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 rounded-full transition-colors"
                                        title="Attach file"
                                    >
                                        <Paperclip className="h-6 w-6" />
                                    </button>
                                </div>
                                <div className="flex-1 bg-white rounded-2xl border border-gray-300 shadow-sm focus-within:shadow-md focus-within:border-green-500 focus-within:ring-1 focus-within:ring-green-500 transition-all overflow-hidden flex flex-col">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0] || null
                                            setSelectedFile(f)
                                            if (f) {
                                                setPendingAudio(null)
                                                setIsAudioPanelOpen(false)
                                            }
                                        }}
                                    />

                                    {selectedFile && (
                                        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                                            <div className="text-xs text-gray-700 truncate">
                                                Attached: <span className="font-medium">{selectedFile.name}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedFile(null)}
                                                className="text-xs text-gray-500 hover:text-gray-700"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    )}

                                    {isAudioPanelOpen && !isInternalNote && (
                                        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
                                            <AudioRecorderOrUploader value={pendingAudio} onChange={setPendingAudio} />
                                        </div>
                                    )}

                                    {isInternalNote && (
                                        <div className="bg-amber-100/50 px-3 py-1 text-[10px] font-bold text-amber-700 flex items-center gap-1 border-b border-amber-100">
                                            <AlertCircle className="h-3 w-3" />
                                            Internal Note (Private)
                                        </div>
                                    )}
                                    <input
                                        value={messageText}
                                        onChange={e => setMessageText(e.target.value)}
                                        placeholder={isInternalNote ? "Type an internal note..." : "Type a message..."}
                                        className="w-full border-none p-3 text-sm focus:ring-0 max-h-32 bg-transparent"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage(e);
                                            }
                                        }}
                                    />
                                </div>
                                <div className="flex flex-col justify-end gap-2 pb-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsInternalNote(v => !v)
                                            setIsAudioPanelOpen(false)
                                            setPendingAudio(null)
                                        }}
                                        className={`p-3 rounded-full transition-all ${isInternalNote ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                                        title="Internal note"
                                    >
                                        <FileText className="h-5 w-5" />
                                    </button>

                                    {(messageText.trim() || selectedFile || pendingAudio?.file) ? (
                                        <button type="submit" className="p-3 bg-green-600 text-white rounded-full hover:bg-green-700 shadow-lg hover:shadow-xl transition-all scale-100 active:scale-95 duration-200">
                                            <Send className="h-5 w-5 ml-0.5" />
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isInternalNote) return
                                                setIsAudioPanelOpen(v => !v)
                                            }}
                                            className="p-3 rounded-full transition-all bg-gray-200 text-gray-600 hover:bg-gray-300"
                                            title="Audio message"
                                        >
                                            <Mic className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </>
                )}
            </div>

            <ContactProfileDrawer
                isOpen={isContactDrawerOpen}
                onClose={() => {
                    setIsContactDrawerOpen(false)
                    setFocusAliasOnOpen(false)
                }}
                focusAliasOnOpen={focusAliasOnOpen}
                botEnabled={botEnabled}
                onToggleBot={(enabled) => toggleBotForConversation(enabled, selectedBotId)}
                contact={selectedChat?.contact ? {
                    ...selectedChat.contact,
                    // UI fallbacks
                    name: selectedChat.contact.name || selectedChat?.name || 'Unknown',
                    phone: selectedChat.contact.phone || selectedChat?.phone || selectedChat?.waId || '',
                    wa_id: selectedChat.contact.wa_id || selectedChat?.waId || '',
                    tags: selectedChat.contact.tags || [],
                    custom_fields: selectedChat.contact.custom_fields || {},
                } : {
                    id: null,
                    name: selectedChat?.name || 'Unknown',
                    custom_name: null,
                    phone: selectedChat?.phone || selectedChat?.waId || '',
                    wa_id: selectedChat?.waId || '',
                    tags: selectedChat?.contact?.tags || [],
                    created_at: selectedChat?.contact?.created_at || null,
                    custom_fields: selectedChat?.contact?.custom_fields || {},
                }}
                onContactUpdated={(updated) => {
                    if (!updated) return
                    setChats(prev => prev.map(c => {
                        const sameById = updated?.id && idsEqual(c?.contactId, updated.id)
                        const sameByWa = updated?.wa_id && String(c?.waId || '') === String(updated.wa_id)
                        if (!sameById && !sameByWa) return c
                        const nextContact = { ...(c.contact || {}), ...updated }
                        return { ...c, contact: nextContact, name: getDisplayName(nextContact) }
                    }))
                    setSelectedChat(prev => {
                        if (!prev) return prev
                        const nextContact = { ...(prev.contact || {}), ...updated }
                        return { ...prev, contact: nextContact, name: getDisplayName(nextContact) }
                    })
                }}
            />
        </div>
        </AudioPlayerProvider>
    )
}

