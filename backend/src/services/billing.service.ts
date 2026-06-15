import { supabase } from '../config/supabase.js';

export async function getOrganizationPlanLimits(organizationId: string) {
    const { data: org } = await supabase
        .from('organizations')
        .select('plan_id')
        .eq('id', organizationId)
        .maybeSingle();

    const planId = org?.plan_id || null;
    const { data: plan } = planId
        ? await supabase
            .from('whatsapp_subscription_plans')
            .select('id, name, limits')
            .eq('id', planId)
            .maybeSingle()
        : { data: null };

    return {
        plan_id: plan?.id || planId,
        plan_name: plan?.name || 'No active plan',
        limits: plan?.limits || {},
    };
}

export async function enforcePlanResourceLimit(params: {
    organization_id: string;
    resource: 'contacts' | 'flows' | 'ai_agents' | 'agents' | 'numbers';
    table: string;
    countColumn?: string;
    filters?: Record<string, any>;
    label: string;
}) {
    const planInfo = await getOrganizationPlanLimits(params.organization_id);
    const limit = Number(planInfo.limits?.[params.resource] ?? -1);
    if (limit < 0) return { allowed: true, limit, used: 0, plan: planInfo };

    let query = supabase
        .from(params.table)
        .select(params.countColumn || 'id', { count: 'exact', head: true })
        .eq('organization_id', params.organization_id);

    for (const [key, value] of Object.entries(params.filters || {})) {
        if (Array.isArray(value)) query = query.in(key, value);
        else query = query.eq(key, value);
    }

    const { count, error } = await query;
    if (error) throw error;
    const used = Number(count || 0);

    if (used >= limit) {
        const err: any = new Error(`${params.label} limit reached for ${planInfo.plan_name} plan (${used}/${limit}). Upgrade your plan to add more.`);
        err.statusCode = 402;
        err.limit = { resource: params.resource, used, limit, plan: planInfo };
        throw err;
    }

    return { allowed: true, limit, used, plan: planInfo };
}

export async function enforceWhatsAppCloudNumberLimit(organizationId: string, phoneNumberId: string) {
    const { data: existingAccount, error: existingAccountErr } = await supabase
        .from('w_wa_accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone_number_id', phoneNumberId)
        .maybeSingle();
    if (existingAccountErr) throw existingAccountErr;
    if (existingAccount?.id) return existingAccount;

    const planInfo = await getOrganizationPlanLimits(organizationId);
    const limit = Number(planInfo.limits?.numbers ?? -1);
    if (limit < 0) return null;

    const { count, error } = await supabase
        .from('w_wa_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('status', ['connected', 'active'])
        .not('whatsapp_business_account_id', 'is', null);
    if (error) throw error;

    const used = Number(count || 0);
    if (used >= limit) {
        const err: any = new Error(`WhatsApp number limit reached for ${planInfo.plan_name} plan (${used}/${limit}). Upgrade your plan to add more.`);
        err.statusCode = 402;
        err.limit = { resource: 'numbers', used, limit, plan: planInfo };
        throw err;
    }

    return null;
}
