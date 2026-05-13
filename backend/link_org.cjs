require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function linkOrg() {
  const email = 'anuragverm1632004@gmail.com';
  const targetOrgId = '04db6ecb-f322-4f1a-b3f2-ba0817f99f75';

  const { data: listData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = listData.users.find(u => u.email === email);
  
  if (!user) {
    console.log('User not found!');
    return;
  }

  console.log(`Updating user: ${user.id}`);
  
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...user.user_metadata,
      organization_id: targetOrgId
    }
  });

  if (error) {
    console.error('Update failed:', error);
  } else {
    console.log('Update Successful!');
    console.log('New Metadata:', data.user.user_metadata);
  }
}
linkOrg();
