require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: subs } = await supabase.from('app_user_subscriptions').select('*');
    console.log("Subscriptions:", subs);
    const { data: orgs } = await supabase.from('organizations').select('id, name, plan_id');
    console.log("Organizations:", orgs);
}
run();
