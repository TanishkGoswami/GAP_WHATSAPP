require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  try {
    const { data, error } = await supabase.from('w_wa_accounts').select('*');
    if (error) {
      console.error('Supabase query error:', error);
    } else {
      console.log('Accounts retrieved:', data);
    }
  } catch (err) {
    console.error('Execution error:', err);
  }
}
check();
