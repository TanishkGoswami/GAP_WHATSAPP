const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('w_contacts').select('id, name, phone, wa_id').limit(10);
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}
check();
