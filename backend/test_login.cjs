const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testLogin() {
    console.log("Testing login for anuragverma1632004@gmail.com...");
    const { data, error } = await supabase.auth.signInWithPassword({
        email: 'anuragverma1632004@gmail.com',
        password: 'TestPassword123'
    });

    if (error) {
        console.error("Login failed:", error.message);
    } else {
        console.log("Login successful! Token:", data.session.access_token.substring(0, 20) + "...");
    }
}

testLogin();
