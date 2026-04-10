import { createClient } from '@supabase/supabase-js';
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap, initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase URL or Key');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export const useSupabaseAuthState = async (sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
    // Fetch existing session data
    const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

    let creds: AuthenticationCreds;
    let keys: any = {};

    if (data) {
        // Deserialize keys and creds
        // JSON.parse/stringify with BufferJSON to handle Buffers which Baileys uses extensively
        creds = JSON.parse(JSON.stringify(data.creds), BufferJSON.reviver);
        keys = JSON.parse(JSON.stringify(data.keys), BufferJSON.reviver);
    } else {
        creds = initAuthCreds();
        keys = {};
    }

    const saveState = async () => {
        const credsJson = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
        const keysJson = JSON.parse(JSON.stringify(keys, BufferJSON.replacer));

        await supabase.from('whatsapp_sessions').upsert({
            session_id: sessionId,
            creds: credsJson,
            keys: keysJson
        });
    };

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: any = {};
                    for (const id of ids) {
                        let value = keys[`${type}-${id}`];
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        if (value) {
                            data[id] = value;
                        }
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category in data) {
                        const cat = category as keyof typeof data;
                        for (const id in data[cat]) {
                            const value = data[cat][id];
                            const key = `${cat}-${id}`;
                            if (value) {
                                keys[key] = value;
                            } else {
                                delete keys[key];
                            }
                        }
                    }
                    await saveState();
                }
            }
        },
        saveCreds: saveState
    };
};

/* 
Note: The 'keys' structure in Baileys is a bit complex (SignalKeyStore). 
For simplicity and based on the prompt's single 'keys' column, we're mapping the key-value store to a single JSON object.
Real production apps might split this table for performance, but this fits the requested schema.
*/
