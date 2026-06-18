import { Response } from 'express';
import { supabase } from '../config/supabase.js';
import { decryptToken } from '../utils/crypto.js';
import { inspectMetaTokenPermissions } from '../services/meta.service.js';
import { 
    uploadMediaToStorage, 
    buildBroadcastBillingEstimate, 
    normalizeTemplateHeaderMedia,
    processCampaign
} from '../services/broadcast.service.js';
import crypto from 'crypto';

export async function getBroadcastTags(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data: contacts, error: fetchErr } = await supabase
            .from('w_contacts')
            .select('tags')
            .eq('organization_id', orgId);

        if (fetchErr) throw fetchErr;

        const tagsSet = new Set<string>();
        contacts?.forEach((c: any) => {
            if (Array.isArray(c.tags)) {
                c.tags.forEach((t: string) => tagsSet.add(t));
            }
        });

        res.json({ tags: Array.from(tagsSet) });
    } catch (err: any) {
        console.error('Fetch Tags Error:', err);
        res.status(500).json({ error: err.message });
    }
}

export async function uploadHeaderMedia(req: any, res: Response) {
    const orgId = req.organization_id;
    const file = req.file;

    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });
        if (!file) return res.status(400).json({ error: 'File is required' });

        const uploaded = await uploadMediaToStorage({
            organization_id: orgId,
            conversation_id: 'broadcast-template-headers',
            fileName: file.originalname || `template-header-${crypto.randomUUID()}`,
            mimeType: file.mimetype || 'application/octet-stream',
            buffer: file.buffer
        });

        res.json(uploaded);
    } catch (err: any) {
        console.error('Broadcast header media upload error:', err);
        res.status(500).json({ error: err.message || 'Failed to upload header media' });
    }
}

export async function estimateBroadcast(req: any, res: Response) {
    const orgId = req.organization_id;
    const { audience_tag, audience_type, csv_data, template_category } = req.body || {};

    try {
        if (!orgId) return res.status(400).json({ error: 'organization_id is required' });
        const estimate = await buildBroadcastBillingEstimate({
            organization_id: orgId,
            audience_tag: audience_tag || null,
            audience_type: audience_type || null,
            csv_data: Array.isArray(csv_data) ? csv_data : null,
            template_category,
        });
        res.json(estimate);
    } catch (err: any) {
        console.error('[broadcast/estimate] Error:', err);
        res.status(500).json({ error: err.message || 'Failed to estimate broadcast cost' });
    }
}

export async function sendBroadcast(req: any, res: Response) {
    const orgId = req.organization_id;
    const {
        name,
        wa_account_id,
        audience_tag,
        csv_data,
        template_name,
        template_language,
        variable_mapping,
        scheduled_at,
        required_header_type,
        header_media_type,
        header_media_url
    } = req.body;

    try {
        if (!wa_account_id || !template_name || !template_language) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const variableMapping = variable_mapping && typeof variable_mapping === 'object' ? { ...variable_mapping } : {};
        if (header_media_url) {
            const mediaType = String(header_media_type || variableMapping.header_media_type || variableMapping._header_media_type || 'image').toLowerCase();
            variableMapping._header_media_type = mediaType;
            variableMapping._header_media_url = header_media_url;
            variableMapping.header_media_type = mediaType;
            variableMapping.header_media_url = header_media_url;
        }

        const requiredHeaderTypeFromClient = String(required_header_type || '').toLowerCase();
        if (['image', 'video', 'document'].includes(requiredHeaderTypeFromClient)) {
            const { type: headerMediaType, url: headerMediaUrl } = normalizeTemplateHeaderMedia(variableMapping, requiredHeaderTypeFromClient);
            if (!headerMediaUrl) {
                return res.status(400).json({
                    error: `Template "${template_name}" requires a ${requiredHeaderTypeFromClient} header media URL. Upload media or paste a public URL before launching.`
                });
            }

            variableMapping._header_media_type = requiredHeaderTypeFromClient;
            variableMapping._header_media_url = headerMediaUrl;
            variableMapping.header_media_type = requiredHeaderTypeFromClient;
            variableMapping.header_media_url = headerMediaUrl;
        }

        const { data: account, error: accountErr } = await supabase
            .from('w_wa_accounts')
            .select('id, phone_number_id, access_token_encrypted, whatsapp_business_account_id')
            .eq('id', wa_account_id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (accountErr) throw accountErr;
        if (!account?.id) return res.status(400).json({ error: 'Selected WhatsApp account was not found' });
        if (!account.access_token_encrypted) return res.status(400).json({ error: 'Selected WhatsApp account is missing a Meta access token. Reconnect this account.' });

        const token = decryptToken(account.access_token_encrypted);
        const tokenInspection = await inspectMetaTokenPermissions(token);
        if (tokenInspection.checked && tokenInspection.missingScopes.length > 0) {
            return res.status(400).json({
                error: `Selected WhatsApp account token is missing required Meta permission(s): ${tokenInspection.missingScopes.join(', ')}. Reconnect using a System User or embedded signup token with whatsapp_business_messaging and whatsapp_business_management.`
            });
        }

        const payload: any = {
            organization_id: orgId,
            wa_account_id,
            name: name || `Broadcast to ${audience_tag || 'Audience'}`,
            audience_tag: audience_tag || null,
            csv_data: Array.isArray(csv_data) ? csv_data : null,
            template_name,
            template_language,
            variable_mapping: variableMapping,
            status: scheduled_at ? 'scheduled' : 'processing',
        };

        if (scheduled_at) {
            const schDate = new Date(scheduled_at);
            if (!isNaN(schDate.getTime())) {
                payload.scheduled_at = schDate.toISOString();
            }
        }

        const { data, error } = await supabase.from('w_campaigns').insert(payload).select().single();
        if (error) throw error;

        if (!scheduled_at) {
            processCampaign(data).catch(err => console.error('Background processCampaign error:', err));
        }
        res.json({ success: true, campaign: data });
    } catch (err: any) {
        console.error('Send Broadcast Error:', err);
        res.status(500).json({ error: err.message });
    }
}

export async function getCampaigns(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_campaigns')
            .select('*')
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ campaigns: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function deleteCampaign(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { error } = await supabase
            .from('w_campaigns')
            .delete()
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .eq('status', 'scheduled');

        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function cancelCampaign(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const { data, error } = await supabase
            .from('w_campaigns')
            .update({ status: 'cancelled' })
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .in('status', ['processing', 'scheduled'])
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Campaign not found or cannot be cancelled' });
        res.json({ success: true, campaign: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}
