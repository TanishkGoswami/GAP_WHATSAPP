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
import { cancelCampaignRecipients, dispatchCampaignWindow } from '../services/broadcastQueue.service.js';
import { enqueueCampaignPreparation, isBroadcastQueueEnabled } from '../config/broadcastQueue.js';
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
        audience_type,
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
        if (process.env.BROADCAST_GLOBAL_PAUSED === 'true') {
            return res.status(503).json({ error: 'Broadcast sending is temporarily paused by the platform' });
        }
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
            .select('id, phone_number_id, access_token_encrypted, whatsapp_business_account_id, broadcasts_paused')
            .eq('id', wa_account_id)
            .eq('organization_id', orgId)
            .maybeSingle();
        if (accountErr) throw accountErr;
        if (!account?.id) return res.status(400).json({ error: 'Selected WhatsApp account was not found' });
        if (account.broadcasts_paused) return res.status(423).json({ error: 'Broadcasts are paused for this WhatsApp account' });
        if (!account.access_token_encrypted) return res.status(400).json({ error: 'Selected WhatsApp account is missing a Meta access token. Reconnect this account.' });

        const { data: organization } = await supabase.from('organizations')
            .select('broadcasts_paused').eq('id', orgId).maybeSingle();
        if (organization?.broadcasts_paused) {
            return res.status(423).json({ error: 'Broadcasts are paused for this organization' });
        }

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
            audience_type: audience_type || variableMapping._audience_type || 'all',
            csv_data: Array.isArray(csv_data) ? csv_data : null,
            template_name,
            template_language,
            variable_mapping: variableMapping,
            status: isBroadcastQueueEnabled() ? 'preparing' : (scheduled_at ? 'scheduled' : 'processing'),
            schema_version: isBroadcastQueueEnabled() ? 2 : 1,
            idempotency_key: req.body.idempotency_key || req.get('Idempotency-Key') || null,
        };

        if (scheduled_at) {
            const schDate = new Date(scheduled_at);
            if (!isNaN(schDate.getTime())) {
                payload.scheduled_at = schDate.toISOString();
            }
        }

        if (isBroadcastQueueEnabled()) {
            const estimate = await buildBroadcastBillingEstimate({
                organization_id: orgId,
                audience_tag: audience_tag || null,
                audience_type: payload.audience_type,
                csv_data: payload.csv_data,
                template_category: variableMapping._template_category,
            });
            if (!estimate.plan.allowed) return res.status(403).json({ error: 'Monthly broadcast limit reached' });
            if (!estimate.enough_wallet) return res.status(402).json({ error: 'Insufficient wallet balance' });
            if (estimate.audience_count > Number(process.env.BROADCAST_MAX_RECIPIENTS || 10_000)) {
                return res.status(400).json({ error: 'Campaign cannot exceed 10,000 recipients' });
            }
        }

        const { data, error } = await supabase.from('w_campaigns').insert(payload).select().single();
        if (error?.code === '23505' && payload.idempotency_key) {
            const { data: existing } = await supabase.from('w_campaigns')
                .select('*').eq('organization_id', orgId).eq('idempotency_key', payload.idempotency_key).single();
            if (existing && isBroadcastQueueEnabled() && ['preparing', 'queued'].includes(existing.status)) {
                await enqueueCampaignPreparation(existing.id, existing.scheduled_at);
            }
            return res.json({ success: true, campaign: existing, idempotent_replay: true });
        }
        if (error) throw error;

        if (isBroadcastQueueEnabled()) {
            try {
                await enqueueCampaignPreparation(data.id, data.scheduled_at);
            } catch (queueError: any) {
                await supabase.from('w_campaigns').update({
                    queue_error: queueError.message || 'Queue unavailable',
                }).eq('id', data.id);
                return res.status(503).json({
                    error: 'Campaign was saved but the broadcast queue is unavailable. Retry with the same idempotency key.',
                    campaign: data,
                });
            }
        } else if (!scheduled_at) {
            processCampaign(data).catch(err => console.error('Background processCampaign error:', err));
        }
        res.status(202).json({ success: true, campaign: data });
    } catch (err: any) {
        console.error('Send Broadcast Error:', err);
        res.status(500).json({ error: err.message });
    }
}

export async function getCampaigns(req: any, res: Response) {
    const orgId = req.organization_id;
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
        const from = (page - 1) * pageSize;
        const { data, error, count } = await supabase
            .from('w_campaigns')
            .select('id, organization_id, wa_account_id, name, audience_tag, audience_type, template_name, template_language, status, schema_version, total_contacts, prepared_count, queued_count, processing_count, accepted_count, sent_count, delivered_count, read_count, failed_count, cancelled_count, billing_category, estimated_cost_paise, actual_cost_paise, billing_status, scheduled_at, created_at, completed_at, queue_error', { count: 'exact' })
            .eq('organization_id', orgId)
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) throw error;
        const legacyIds = (data || []).filter((campaign: any) => Number(campaign.schema_version || 1) < 2).map((campaign: any) => campaign.id);
        let legacyById = new Map<string, any>();
        if (legacyIds.length) {
            const { data: legacyRows } = await supabase.from('w_campaigns').select('id, csv_data, results').in('id', legacyIds);
            legacyById = new Map((legacyRows || []).map((campaign: any) => [campaign.id, campaign]));
        }
        const campaigns = (data || []).map((campaign: any) => ({ ...campaign, ...(legacyById.get(campaign.id) || {}) }));
        res.json({ campaigns, pagination: { page, page_size: pageSize, total: count || 0 } });
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
            .update({ status: isBroadcastQueueEnabled() ? 'cancelling' : 'cancelled' })
            .eq('id', req.params.id)
            .eq('organization_id', orgId)
            .in('status', ['preparing', 'queued', 'processing', 'pausing', 'paused', 'scheduled'])
            .select()
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Campaign not found or cannot be cancelled' });
        if (isBroadcastQueueEnabled() && data.schema_version >= 2) {
            void cancelCampaignRecipients(data.id).catch(error => {
                console.error('[broadcast] Cancellation cleanup failed', { campaignId: data.id, message: error.message });
            });
        }
        res.json({ success: true, campaign: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
}

export async function pauseCampaign(req: any, res: Response) {
    try {
        const { data, error } = await supabase.from('w_campaigns')
            .update({ status: 'paused', last_progress_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .eq('organization_id', req.organization_id)
            .in('status', ['queued', 'processing', 'pausing'])
            .select().maybeSingle();
        if (error) throw error;
        if (!data) return res.status(409).json({ error: 'Campaign cannot be paused in its current state' });
        res.json({ success: true, campaign: data });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function resumeCampaign(req: any, res: Response) {
    try {
        const { data, error } = await supabase.from('w_campaigns')
            .update({ status: 'queued', last_progress_at: new Date().toISOString() })
            .eq('id', req.params.id)
            .eq('organization_id', req.organization_id)
            .eq('status', 'paused')
            .select().maybeSingle();
        if (error) throw error;
        if (!data) return res.status(409).json({ error: 'Only paused campaigns can be resumed' });
        await dispatchCampaignWindow(data.id);
        res.json({ success: true, campaign: data });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}

export async function getCampaignRecipients(req: any, res: Response) {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25)));
        const from = (page - 1) * pageSize;
        const { data: campaign } = await supabase.from('w_campaigns')
            .select('id').eq('id', req.params.id).eq('organization_id', req.organization_id).maybeSingle();
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

        let query = supabase.from('w_campaign_recipients')
            .select('id, normalized_phone, contact_name, status, attempt_count, wa_message_id, error_class, error_code, error_message, billing_status, accepted_at, delivered_at, read_at, failed_at, created_at', { count: 'exact' })
            .eq('campaign_id', campaign.id);
        if (req.query.status) query = query.eq('status', String(req.query.status));
        if (req.query.search) {
            const search = String(req.query.search).replace(/[%_,()]/g, '');
            query = query.or(`normalized_phone.ilike.%${search}%,contact_name.ilike.%${search}%`);
        }
        const { data, error, count } = await query.order('created_at').range(from, from + pageSize - 1);
        if (error) throw error;
        res.json({ recipients: data || [], pagination: { page, page_size: pageSize, total: count || 0 } });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}
