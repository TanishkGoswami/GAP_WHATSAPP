import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: './.env' })

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function getColumns() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'organization_members' })
    if (error) {
        // Fallback: check a few records
        const { data: records, error: fetchError } = await supabase.from('organization_members').select('*').limit(1)
        if (fetchError) console.error(fetchError)
        else console.log("Sample record:", JSON.stringify(records[0], null, 2))
    } else {
        console.log("Columns:", data)
    }
}

getColumns()
