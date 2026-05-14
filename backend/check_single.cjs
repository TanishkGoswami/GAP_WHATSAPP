require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find(u => u.email === 'anuragverm1632004@gmail.com');
  if (user) {
    console.log('Email:', user.email);
    console.log('Org ID:', user.user_metadata?.organization_id || 'Not Assigned');
    console.log('Full Metadata:', user.user_metadata);
  } else {
    console.log('User not found in the first 1000 users.');
  }
}
check();
