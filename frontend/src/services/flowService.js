import { supabase } from '../supabaseClient'

// Mock storage for development
const LOCAL_STORAGE_KEY = 'whatsapp_bot_flow'

export async function saveFlow(flowData) {
    // In production:
    // const { error } = await supabase
    //   .from('w_bot_flows')
    //   .upsert({ 
    //     id: flowData.id,
    //     flow_data: flowData,
    //     updated_at: new Date() 
    //   })

    console.log('Saving flow...', flowData)

    // For demo, save to local storage so it persists on reload
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(flowData))

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800))

    return { error: null }
}

export async function loadFlow() {
    // In production:
    // const { data, error } = await supabase
    //   .from('w_bot_flows')
    //   .select('*')
    //   .single()

    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)

    if (saved) {
        return { data: JSON.parse(saved), error: null }
    }

    return { data: null, error: null }
}
