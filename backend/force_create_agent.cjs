const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function forceCreateAgent() {
    console.log("Attempting to create user: anuragverma1632004@gmail.com");
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: "anuragverma1632004@gmail.com",
        password: "TestPassword123",
        email_confirm: true,
        user_metadata: {
            role: "agent",
            organization_id: "00000000-0000-0000-0000-000000000000",
            name: "Anurag Agent"
        }
    });

    if (authErr && !authErr.message.includes("already been registered")) {
        console.error("Auth Error:", authErr.message);
        return;
    }

    let userId = authData?.user?.id;
    if (!userId) {
        // Find existing
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const user = listData.users.find(u => u.email === "anuragverma1632004@gmail.com");
        if (user) {
            userId = user.id;
            console.log("User already existed, found ID:", userId);
        } else {
            console.log("Failed to find user ID");
            return;
        }
    } else {
        console.log("User created successfully:", userId);
    }

    console.log("Updating password...");
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: "TestPassword123",
        email_confirm: true
    });
    if (updateErr) console.error("Update pass error:", updateErr);

    console.log("Attempting to insert into organization_members...");
    const { data: member } = await supabaseAdmin.from('organization_members').select('*').eq('user_id', userId).maybeSingle();
    if (!member) {
        const { error: insertErr } = await supabaseAdmin
            .from('organization_members')
            .insert([{
                organization_id: "00000000-0000-0000-0000-000000000000",
                user_id: userId,
                role: "agent",
                name: "Anurag Agent",
                email: "anuragverma1632004@gmail.com"
            }]);

        if (insertErr) {
            console.error("Insert Error:", insertErr);
        } else {
            console.log("Insert successful!");
        }
    } else {
        console.log("Already a member.");
    }
}

forceCreateAgent();
