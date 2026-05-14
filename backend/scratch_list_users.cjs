const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const email = process.argv[2] || 'test@example.com';
    console.log('Testing invite for:', email);
    
    console.log('Fetching users...');
    let page = 1;
    let allUsers = [];
    while (true) {
        const { data: users, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
        if (listErr || !users?.users?.length) break;
        allUsers.push(...users.users);
        if (users.users.length < 100) break;
        page++;
    }
    console.log('Total users fetched:', allUsers.length);
}

run();
