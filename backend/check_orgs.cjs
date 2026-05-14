require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data } = await supabase.auth.admin.listUsers();
  console.log('--- USER ORG LIST ---');
  data.users.forEach(u => {
    console.log(`Email: ${u.email} => Org ID: ${u.user_metadata?.organization_id || 'Not Assigned'}`);
  });
}
check();
