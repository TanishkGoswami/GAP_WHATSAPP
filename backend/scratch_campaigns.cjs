const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('w_campaigns').select('*').order('created_at', { ascending: false }).limit(5);
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
check();
