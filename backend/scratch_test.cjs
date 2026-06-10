const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';

function decryptToken(stored) {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32 || !stored.includes(':')) {
        return stored;
    }
    try {
        const [ivHex, encHex] = stored.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString();
    } catch (e) {
        return stored;
    }
}

async function run() {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: accounts, error } = await supabase
        .from('w_wa_accounts')
        .select('*')
        .not('whatsapp_business_account_id', 'is', null);

    if (error) {
        console.error('Supabase error:', error);
        return;
    }

    if (!accounts || accounts.length === 0) {
        console.error('No accounts found in Supabase');
        return;
    }

    const account = accounts[0];
    const token = decryptToken(account.access_token_encrypted);
    const waba_id = account.whatsapp_business_account_id;

    // Try creating payment_installment_reminder
    const payload = {
        name: 'payment_installment_reminder',
        category: 'UTILITY',
        language: 'en_US',
        components: [
            { 
                type: 'BODY', 
                text: 'Hello {{1}},\n\nThis is a friendly reminder that the next installment of {{2}} for your unit at *{{3}}* is due on {{4}}.\n\nYou can pay online using the link below to avoid any late payment charge.',
                example: {
                    body_text: [
                        ['Sample 1', 'Sample 2', 'Sample 3', 'Sample 4']
                    ]
                }
            },
            { type: 'FOOTER', text: 'GAP Real Estate Group' },
            {
                type: 'BUTTONS',
                buttons: [
                    { type: 'URL', text: 'Pay Online', url: 'https://example.com/pay' },
                    { type: 'PHONE_NUMBER', text: 'Contact Accounts', phone_number: '+16505551234' }
                ]
            }
        ]
    };

    console.log('Sending creation request payload to Meta:', JSON.stringify(payload, null, 2));

    const postRes = await fetch(`https://graph.facebook.com/v20.0/${waba_id}/message_templates`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    const postJson = await postRes.json();
    console.log('Meta Creation Response Status:', postRes.status);
    console.log('Meta Creation Response JSON:', JSON.stringify(postJson, null, 2));
}

run();
