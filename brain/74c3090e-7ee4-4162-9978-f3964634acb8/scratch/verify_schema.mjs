
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    try {
        console.log('Checking w_flow_sessions...');
        const { data: cols, error: err } = await supabase.from('w_flow_sessions').select('*').limit(1);
        if (err) {
            console.error('Error fetching w_flow_sessions:', err);
        } else {
            console.log('w_flow_sessions sample:', cols);
        }

        console.log('\nChecking w_messages constraint...');
        const { error: msgErr } = await supabase.from('w_messages').insert({
            organization_id: '00000000-0000-0000-0000-000000000000',
            contact_id: '00000000-0000-0000-0000-000000000000',
            direction: 'outbound',
            type: 'interactive',
            content: { text: 'test' },
            status: 'sent'
        });
        
        if (msgErr) {
            console.log('Constraint Violation (Expected if not fixed):', msgErr.message);
        } else {
            console.log('Success: "interactive" type is allowed!');
            // Clean up
            await supabase.from('w_messages').delete().eq('content->>text', 'test');
        }
    } catch (e) {
        console.error('Script Error:', e);
    }
}

checkSchema();
