require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function increaseAiLimit() {
    const { data: plans } = await supabase.from('whatsapp_subscription_plans').select('*');
    for (const plan of plans) {
        if (plan.id === 'growth') {
            const limits = { ...plan.limits, ai_agents: 5 }; // Increased to 5
            await supabase.from('whatsapp_subscription_plans').update({ limits }).eq('id', plan.id);
            console.log("Updated Growth limit");
        }
        if (plan.id === 'starter') {
            const limits = { ...plan.limits, ai_agents: 2 }; // Give starter some too
            await supabase.from('whatsapp_subscription_plans').update({ limits }).eq('id', plan.id);
            console.log("Updated Starter limit");
        }
    }
}
increaseAiLimit();
