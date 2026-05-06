const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
        console.error("Error fetching users:", error);
        return;
    }
    console.log(`Found ${data.users.length} users:`);
    data.users.forEach(u => {
        console.log(`Email: ${u.email}, Role: ${u.user_metadata?.role}`);
    });
}
check();
