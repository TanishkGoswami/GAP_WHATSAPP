const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testCreateUser() {
    console.log("Attempting to create user...");
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: "anuragverma1632004+test1@gmail.com",
        password: "TestPassword123",
        email_confirm: true,
        user_metadata: {
            role: "agent",
            organization_id: "Default",
            name: "Test Agent"
        }
    });

    if (authErr) {
        console.error("Auth Error:", authErr.message);
        return;
    }

    console.log("User created successfully:", authData.user.id);

    console.log("Attempting to insert into organization_members...");
    const { error: insertErr } = await supabaseAdmin
        .from('organization_members')
        .insert([{
            organization_id: "Default",
            user_id: authData.user.id,
            role: "agent",
            name: "Test Agent",
            email: "anuragverma1632004+test1@gmail.com"
        }]);

    if (insertErr) {
        console.error("Insert Error:", insertErr);
    } else {
        console.log("Insert successful!");
    }
}

testCreateUser();
