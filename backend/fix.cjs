require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
    // 1. Get all organizations
    const { data: orgs } = await supabase.from('organizations').select('id, name, plan_id');
    
    // 2. Get all owners
    const { data: members } = await supabase.from('organization_members').select('organization_id, user_id').eq('role', 'owner');
    
    // 3. Get all subscriptions
    const { data: subs } = await supabase.from('app_user_subscriptions').select('user_id, plan_id, plan_label, expires_at');

    for (const org of orgs) {
        const owner = members.find(m => m.organization_id === org.id);
        if (!owner) continue;

        const sub = subs.find(s => s.user_id === owner.user_id);
        if (sub) {
            let newPlanId = 'free';
            const pid = (sub.plan_id || '').toLowerCase();
            const label = (sub.plan_label || '').toLowerCase();

            if (pid.includes('growth') || label.includes('growth')) newPlanId = 'growth';
            else if (pid.includes('pro') || label.includes('pro') || label.includes('premium')) newPlanId = 'pro';
            else if (pid.includes('starter') || label.includes('starter')) newPlanId = 'starter';
            else if (pid.includes('monthly') || pid.includes('all_in_one')) newPlanId = 'growth'; // Mapping GAP Core to Growth as an example, or Pro

            // Based on user's screenshot, it's WA Growth, so it will match "growth"
            if (org.plan_id !== newPlanId) {
                console.log(`Updating ${org.name} from ${org.plan_id} to ${newPlanId}`);
                await supabase.from('organizations').update({ plan_id: newPlanId }).eq('id', org.id);
            }
        }
    }
    console.log("Done");
}
fix();
