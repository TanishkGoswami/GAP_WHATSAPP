import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { getIO } from '../config/socket.js';
import { enforcePlanResourceLimit } from '../services/billing.service.js';
import { 
    normalizeWaIdToPhone, 
    normalizeIndianPhoneKey, 
    derivePhoneForStorage 
} from '../utils/format.js';

export async function getContacts(req: any, res: Response) {
    const organization_id = req.organization_id;
    const includeGroups = req.query.include_groups === 'true';
    const includeUnsaved = req.query.include_unsaved === 'true';

    if (!organization_id) {
        return res.status(403).json({ error: 'No organization linked to this account' });
    }

    try {
        let query = supabase
            .from('w_contacts')
            .select('id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source')
            .eq('organization_id', organization_id)
            .order('created_at', { ascending: false });

        if (!includeGroups) {
            query = query.or('contact_type.eq.individual,contact_type.is.null');
        }

        if (!includeUnsaved) {
            query = query.not('saved_at', 'is', null);
        }

        let { data, error } = await query;
        if (error) throw error;

        const rows = (data || []).map((c: any) => {
            const next = { ...c };
            const phone = String(next.phone || '').trim();
            if (!phone) {
                const derived = derivePhoneForStorage(next.wa_id);
                if (derived) next.phone = derived;
            }
            if (!next.wa_key) {
                next.wa_key = normalizeIndianPhoneKey(next.wa_id) || null;
            }
            return next;
        });

        res.json(rows);
    } catch (err: any) {
        console.error('Error fetching contacts:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch contacts' });
    }
}

export async function getContactProfilePhoto(req: any, res: Response) {
    const organization_id = req.organization_id;
    const contactId = req.params.id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const { data, error } = await supabase
            .from('w_contacts')
            .select('id, custom_fields')
            .eq('id', contactId)
            .eq('organization_id', organization_id)
            .maybeSingle();

        if (error) throw error;
        if (!data?.id) {
            return res.status(200).json({ profile_photo_url: null });
        }

        const profilePhotoUrl = data.custom_fields?.profile_photo_url || null;
        res.json({ profile_photo_url: profilePhotoUrl });
    } catch (err: any) {
        console.error('Error fetching contact profile photo:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch contact profile photo' });
    }
}

export async function createContact(req: any, res: Response) {
    const organization_id = req.organization_id;
    const { name, phone, custom_name, tags = [], custom_fields = {}, wa_account_id = null } = req.body || {};

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const phoneDigits = normalizeWaIdToPhone(phone);
        if (!phoneDigits) return res.status(400).json({ error: 'Valid phone number is required' });

        const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
        const normalizedPhone = wa_key;
        const normalizedTags = Array.isArray(tags)
            ? tags.map((tag: any) => String(tag).trim()).filter(Boolean)
            : String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
        
        const normalizedCustomFields = custom_fields && typeof custom_fields === 'object' && !Array.isArray(custom_fields)
            ? Object.fromEntries(Object.entries(custom_fields)
                .map(([key, value]) => [String(key).trim(), value == null ? '' : String(value).trim()])
                .filter(([key]) => Boolean(key)))
            : {};

        let normalizedAccountId: string | null = null;
        if (wa_account_id) {
            const { data: account, error: accountErr } = await supabase
                .from('w_wa_accounts')
                .select('id')
                .eq('id', String(wa_account_id))
                .eq('organization_id', organization_id)
                .maybeSingle();
            if (accountErr) throw accountErr;
            if (!account?.id) return res.status(400).json({ error: 'Selected WhatsApp account was not found' });
            normalizedAccountId = account.id;
        }

        const { data: existing, error: existingErr } = await supabase
            .from('w_contacts')
            .select('id')
            .eq('organization_id', organization_id)
            .eq('wa_key', wa_key)
            .maybeSingle();
        if (existingErr) throw existingErr;
        if (existing?.id) return res.status(409).json({ error: 'Contact already exists' });

        await enforcePlanResourceLimit({
            organization_id,
            resource: 'contacts',
            table: 'w_contacts',
            filters: { contact_type: 'individual' },
            label: 'Contact',
        });

        const { data, error } = await supabase
            .from('w_contacts')
            .insert({
                organization_id,
                wa_account_id: normalizedAccountId,
                name: String(name || '').trim() || normalizedPhone,
                custom_name: typeof custom_name === 'string' && custom_name.trim() ? custom_name.trim() : null,
                phone: normalizedPhone,
                wa_id: normalizedPhone,
                wa_key,
                tags: normalizedTags,
                custom_fields: normalizedCustomFields,
                contact_type: 'individual',
                saved_at: new Date().toISOString(),
                saved_by_user_id: req.user?.id || null,
                save_source: 'manual'
            })
            .select('id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source')
            .single();
        if (error) throw error;

        try { getIO().emit('contact_updated', { contact: data }); } catch(e) {}
        res.status(201).json(data);
    } catch (err: any) {
        console.error('Error creating contact:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create contact', limit: err.limit });
    }
}

export async function updateContact(req: any, res: Response) {
    const contactId = req.params.id;
    const organization_id = req.organization_id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id, wa_key, custom_fields')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) return res.status(403).json({ error: 'Forbidden' });

        const updates: any = {};

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'custom_name')) {
            const raw = (req.body?.custom_name ?? null);
            const custom_name = typeof raw === 'string' ? raw.trim() : null;
            updates.custom_name = custom_name ? custom_name : null;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
            updates.name = String(req.body?.name || '').trim() || null;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')) {
            const phoneDigits = normalizeWaIdToPhone(req.body?.phone);
            if (!phoneDigits) return res.status(400).json({ error: 'Valid phone number is required' });
            const wa_key = normalizeIndianPhoneKey(phoneDigits) || phoneDigits;
            updates.phone = wa_key;
            updates.wa_id = wa_key;
            updates.wa_key = wa_key;
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'tags')) {
            updates.tags = Array.isArray(req.body.tags)
                ? req.body.tags.map((tag: any) => String(tag).trim()).filter(Boolean)
                : String(req.body.tags || '').split(',').map((tag: string) => tag.trim()).filter(Boolean);
        }

        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'custom_fields')) {
            const incoming = req.body.custom_fields && typeof req.body.custom_fields === 'object' && !Array.isArray(req.body.custom_fields)
                ? Object.fromEntries(Object.entries(req.body.custom_fields)
                    .map(([key, value]) => [String(key).trim(), value == null ? '' : String(value).trim()])
                    .filter(([key]) => Boolean(key)))
                : {};
            const currentFields = existing.custom_fields && typeof existing.custom_fields === 'object' ? existing.custom_fields : {};
            const protectedFields = ['profile_photo_url', 'profile_photo_checked_at'].reduce((acc: any, key) => {
                if (currentFields[key]) acc[key] = currentFields[key];
                return acc;
            }, {});
            updates.custom_fields = { ...incoming, ...protectedFields };
        }

        if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No contact fields were provided' });

        if (existing.wa_key && Object.prototype.hasOwnProperty.call(updates, 'custom_name')) {
            const { error: updAllErr } = await supabase
                .from('w_contacts')
                .update({ custom_name: updates.custom_name })
                .eq('organization_id', organization_id)
                .eq('wa_key', existing.wa_key);
            if (updAllErr) throw updAllErr;
        }

        const { data: updated, error: updErr } = await supabase
            .from('w_contacts')
            .update(updates)
            .eq('id', contactId)
            .select('id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source')
            .single();
        if (updErr) throw updErr;

        try { getIO().emit('contact_updated', { contact: updated }); } catch(e) {}
        res.json(updated);
    } catch (err: any) {
        console.error('Error updating contact:', err);
        res.status(500).json({ error: err.message || 'Failed to update contact' });
    }
}

export async function saveContact(req: any, res: Response) {
    const contactId = req.params.id;
    const organization_id = req.organization_id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id, saved_at')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) return res.status(403).json({ error: 'Forbidden' });

        const { data: updated, error: updErr } = await supabase
            .from('w_contacts')
            .update({
                saved_at: existing.saved_at || new Date().toISOString(),
                saved_by_user_id: req.user?.id || null,
                save_source: 'manual',
            })
            .eq('id', contactId)
            .select('id, name, custom_name, phone, wa_id, wa_key, wa_account_id, tags, custom_fields, created_at, last_active, contact_type, saved_at, saved_by_user_id, save_source')
            .single();
        if (updErr) throw updErr;

        try { getIO().emit('contact_updated', { contact: updated }); } catch(e) {}
        res.json(updated);
    } catch (err: any) {
        console.error('Error saving contact:', err);
        res.status(500).json({ error: err.message || 'Failed to save contact' });
    }
}

export async function deleteContact(req: any, res: Response) {
    const contactId = req.params.id;
    const organization_id = req.organization_id;

    try {
        if (!organization_id) return res.status(400).json({ error: 'organization_id is required' });

        const { data: existing, error: findErr } = await supabase
            .from('w_contacts')
            .select('id, organization_id')
            .eq('id', contactId)
            .maybeSingle();
        if (findErr) throw findErr;
        if (!existing?.id) return res.status(404).json({ error: 'Contact not found' });
        if (existing.organization_id !== organization_id) return res.status(403).json({ error: 'Forbidden' });

        const { error } = await supabase
            .from('w_contacts')
            .delete()
            .eq('id', contactId)
            .eq('organization_id', organization_id);
        if (error) throw error;

        try { getIO().emit('contact_deleted', { id: contactId }); } catch(e) {}
        res.json({ success: true });
    } catch (err: any) {
        console.error('Error deleting contact:', err);
        res.status(500).json({ error: err.message || 'Failed to delete contact' });
    }
}
