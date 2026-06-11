require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function decryptToken(encryptedText) {
    if (!encryptedText) return '';
    try {
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = Buffer.from(parts[1], 'hex');
        const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'utf8');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    } catch (err) {
        console.error('Decryption failed:', err.message);
        return '';
    }
}

async function debug() {
  const { data: accounts } = await supabase.from('w_wa_accounts').select('*').eq('phone_number_id', '1150209371510461').single();
  if (!accounts) {
    console.log('Account not found');
    return;
  }

  const token = decryptToken(accounts.access_token_encrypted);
  console.log('Decrypted Token Prefix:', token.substring(0, 15) + '...');

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
  const response = await fetch(debugUrl);
  const data = await response.json();
  console.log('Meta Debug Token Response:', JSON.stringify(data, null, 2));
}

debug();
