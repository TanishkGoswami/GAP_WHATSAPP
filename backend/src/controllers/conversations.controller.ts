import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { getIO } from '../config/socket.js';
import { getCachedProfilePhotoUrl } from '../services/whatsapp.service.js';
import { derivePhoneForStorage, normalizeIndianPhoneKey, isUuid } from '../utils/format.js';

export async function getConversations(req: any, res: Response) {
    const organization_id = req.organization_id;
    const wa_account_id = req.query.wa_account_id as string;
    const user_id = req.user.id;
    const user_role = req.role;

    if (!organization_id) return res.status(403).json({ error: 'No organization linked to this account' });

    try {
        let query = supabase
            .from('w_conversations')
            .select(`
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields, saved_at, saved_by_user_id, save_source)
            `)
            .eq("organization_id", organization_id)
            .order("last_message_at", { ascending: false });

        if (user_role === 'agent') {
            query = query.eq('assigned_agent_id', user_id);
        }

        if (wa_account_id && wa_account_id !== 'All') {
            if (isUuid(wa_account_id)) {
                query = query.eq('wa_account_id', wa_account_id);
            } else {
                const raw = String(wa_account_id);
                const digits = raw.replace(/\D+/g, '');

                const findAccountId = async (value: string) => {
                    const { data: byPhoneId, error: e1 } = await supabase
                        .from('w_wa_accounts')
                        .select('id')
                        .eq('phone_number_id', value)
                        .maybeSingle();
                    if (e1) throw e1;
                    if (byPhoneId?.id) return byPhoneId.id;

                    const { data: byDisplay, error: e2 } = await supabase
                        .from('w_wa_accounts')
                        .select('id')
                        .eq('display_phone_number', value)
                        .maybeSingle();
                    if (e2) throw e2;
                    if (byDisplay?.id) return byDisplay.id;

                    return null;
                };

                let accountId = await findAccountId(raw);
                if (!accountId && digits && digits !== raw) accountId = await findAccountId(digits);

                if (accountId) {
                    query = query.eq('wa_account_id', accountId);
                } else {
                    console.warn(`⚠️ wa_account_id filter '${wa_account_id}' could not be resolved. Skipping account filter.`);
                }
            }
        }

        let { data: conversations, error } = await query;
        if (error) throw error;

        let readStatesMap = new Map();
        if (user_id && conversations?.length) {
            const { data: reads, error: readErr } = await supabase
                .from('w_conversation_reads')
                .select('conversation_id, last_read_at')
                .eq('user_id', user_id)
                .in('conversation_id', conversations.map((c: any) => c.id));

            if (!readErr && reads) {
                reads.forEach((r: any) => readStatesMap.set(r.conversation_id, r.last_read_at));
            }
        }

        const unreadCountMap = new Map<string, number>();
        if (conversations?.length) {
            const conversationIds = conversations.map((c: any) => c.id);
            const { data: unreadRows, error: unreadErr } = await supabase
                .from('w_messages')
                .select('conversation_id')
                .in('conversation_id', conversationIds)
                .in('direction', ['inbound', 'in'])
                .neq('status', 'read');

            if (unreadErr) {
                console.warn('⚠️ Failed to compute unread counts:', unreadErr.message || unreadErr);
            } else if (Array.isArray(unreadRows)) {
                for (const row of unreadRows) {
                    const cid = (row as any)?.conversation_id;
                    if (!cid) continue;
                    unreadCountMap.set(cid, (unreadCountMap.get(cid) || 0) + 1);
                }
            }
        }

        const result = await Promise.all(conversations.map(async (c: any) => {
            const lastReadAt = readStatesMap.get(c.id);
            const userHasRead = lastReadAt ? new Date(lastReadAt) >= new Date(c.last_message_at) : false;
            const unread_for_user = unreadCountMap.get(c.id) || 0;
            const next = { ...c };

            if (next?.contact) {
                const phone = String(next.contact.phone || '').trim();
                if (!phone) {
                    const derived = derivePhoneForStorage(next.contact.wa_id);
                    if (derived) next.contact.phone = derived;
                }
                if (!next.contact.wa_key) {
                    next.contact.wa_key = normalizeIndianPhoneKey(next.contact.wa_id) || null;
                }
                const storedPhoto = next.contact.custom_fields?.profile_photo_url || null;
                next.contact.profile_photo_url = storedPhoto || await getCachedProfilePhotoUrl(next.contact.wa_id || next.contact.phone);
                if (next.contact.profile_photo_url && next.contact.profile_photo_url !== storedPhoto && next.contact.id) {
                    supabase
                        .from('w_contacts')
                        .update({
                            custom_fields: {
                                ...(next.contact.custom_fields && typeof next.contact.custom_fields === 'object' ? next.contact.custom_fields : {}),
                                profile_photo_url: next.contact.profile_photo_url,
                                profile_photo_checked_at: new Date().toISOString()
                            }
                        })
                        .eq('id', next.contact.id)
                        .then(({ error }: { error: any }) => {
                            if (error) console.warn('Failed to persist profile photo URL:', error.message);
                        });
                }
            }

            return {
                ...next,
                user_has_read: userHasRead,
                unread_for_user
            };
        }));

        res.json(result);
    } catch (err: any) {
        console.error("Error fetching conversations:", err);
        res.status(500).json({ error: err.message });
    }
}

export async function startConversation(req: any, res: Response) {
    const organization_id = req.organization_id;
    const { contact_id, wa_account_id } = req.body;

    if (!organization_id) return res.status(403).json({ error: 'No organization linked to this account' });
    if (!contact_id) return res.status(400).json({ error: 'contact_id is required' });

    try {
        let targetAccountId = wa_account_id;
        if (!targetAccountId) {
            const { data: account } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('organization_id', organization_id)
                .eq('status', 'connected')
                .limit(1)
                .maybeSingle();
            targetAccountId = account?.id;
        }

        if (!targetAccountId) {
            const { data: anyAccount } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('organization_id', organization_id)
                .limit(1)
                .maybeSingle();
            targetAccountId = anyAccount?.id;
        }

        if (!targetAccountId) {
            return res.status(400).json({ error: 'No WhatsApp account found for this organization. Please connect one first.' });
        }

        const { data: existing, error: findErr } = await supabase
            .from('w_conversations')
            .select(`
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields)
            `)
            .eq('organization_id', organization_id)
            .eq('wa_account_id', targetAccountId)
            .eq('contact_id', contact_id)
            .maybeSingle();

        if (findErr) throw findErr;
        if (existing) return res.json(existing);

        const { data: newConv, error: createErr } = await supabase
            .from('w_conversations')
            .insert({
                organization_id,
                wa_account_id: targetAccountId,
                contact_id,
                last_message_at: new Date().toISOString(),
                last_message_preview: 'Conversation started',
                unread_count: 0,
                status: 'open'
            })
            .select(`
                *,
                contact:w_contacts(id, name, custom_name, phone, wa_id, wa_key, created_at, tags, custom_fields)
            `)
            .single();

        if (createErr) throw createErr;

        try { getIO().to(`org:${organization_id}`).emit('conversation_created', newConv); } catch(e) {}
        return res.json(newConv);
    } catch (err: any) {
        console.error("Error starting conversation:", err);
        return res.status(500).json({ error: err.message || 'Failed to start conversation' });
    }
}

export async function assignConversation(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;
    const { agent_id } = req.body;

    try {
        const normalizedAgentId = agent_id ? String(agent_id) : null;
        if (normalizedAgentId) {
            const { data: member, error: memberErr } = await supabase
                .from('organization_members')
                .select('user_id, role, is_active')
                .eq('organization_id', orgId)
                .eq('user_id', normalizedAgentId)
                .maybeSingle();
            if (memberErr) throw memberErr;
            if (!member || member.role !== 'agent' || member.is_active === false) {
                return res.status(400).json({ error: 'Conversation can only be assigned to an active agent' });
            }
        }

        const { data: updated, error } = await supabase
            .from('w_conversations')
            .update({
                assigned_to: normalizedAgentId,
                assigned_agent_id: normalizedAgentId
            })
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, assigned_to')
            .single();

        if (error) throw error;

        try { getIO().to(`org:${orgId}`).emit('conversation_assigned', { conversation_id: id, assigned_to: normalizedAgentId }); } catch(e) {}
        res.json({ success: true, conversation: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function updateConversationMeta(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;
    const payload: any = {};

    if (typeof req.body?.status === 'string') {
        const status = req.body.status.trim().toLowerCase();
        if (!['open', 'archived', 'closed'].includes(status)) return res.status(400).json({ error: 'Invalid conversation status' });
        payload.status = status;
    }

    if (Array.isArray(req.body?.labels)) {
        payload.labels = req.body.labels.map((label: any) => String(label || '').trim().toLowerCase()).filter(Boolean).slice(0, 20);
    }

    if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'No conversation fields provided' });

    try {
        const { data, error } = await supabase
            .from('w_conversations')
            .update(payload)
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, status, labels')
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Conversation not found' });

        try { getIO().to(`org:${orgId}`).emit('conversation_updated', data); } catch(e) {}
        res.json({ success: true, conversation: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to update conversation' });
    }
}

export async function markUnread(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { data: latestInbound, error: msgErr } = await supabase
            .from('w_messages')
            .select('id')
            .eq('conversation_id', id)
            .in('direction', ['inbound', 'in'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (msgErr) throw msgErr;

        if (latestInbound?.id) {
            const { error: updErr } = await supabase
                .from('w_messages')
                .update({ status: 'delivered' })
                .eq('id', latestInbound.id);
            if (updErr) throw updErr;
        }

        await supabase
            .from('w_conversations')
            .update({ unread_count: 1 })
            .eq('id', id)
            .eq('organization_id', orgId);

        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to mark unread' });
    }
}

export async function clearConversation(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { error: deleteErr } = await supabase
            .from('w_messages')
            .delete()
            .eq('conversation_id', id);
        if (deleteErr) throw deleteErr;

        const { data: updated, error: updateErr } = await supabase
            .from('w_conversations')
            .update({
                last_message_preview: 'No messages',
                unread_count: 0
            })
            .eq('id', id)
            .eq('organization_id', orgId)
            .select('id, last_message_preview, unread_count')
            .maybeSingle();
        if (updateErr) throw updateErr;

        try { getIO().to(`org:${orgId}`).emit('conversation_cleared', { conversation_id: id }); } catch(e) {}
        res.json({ success: true, conversation: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to clear chat' });
    }
}

export async function deleteConversation(req: any, res: Response) {
    const orgId = req.organization_id;
    const { id } = req.params;

    try {
        const { data: conv, error: convErr } = await supabase
            .from('w_conversations')
            .select('id')
            .eq('id', id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (convErr) throw convErr;
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });

        const { error: msgErr } = await supabase
            .from('w_messages')
            .delete()
            .eq('conversation_id', id);
        if (msgErr) throw msgErr;

        const { error: deleteErr } = await supabase
            .from('w_conversations')
            .delete()
            .eq('id', id)
            .eq('organization_id', orgId);
        if (deleteErr) throw deleteErr;

        try { getIO().to(`org:${orgId}`).emit('conversation_deleted', { conversation_id: id }); } catch(e) {}
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to delete chat' });
    }
}
