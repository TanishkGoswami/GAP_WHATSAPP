import { supabase } from '../supabaseClient'

// Mock data for development when backend is not ready
const MOCK_CONTACTS = Array.from({ length: 50 }).map((_, i) => ({
    id: `contact-${i}`,
    name: `User ${i + 1}`,
    phone: `+123456789${i}`,
    email: `user${i + 1}@example.com`,
    tags: i % 3 === 0 ? ['VIP', 'Customer'] : ['Lead'],
    custom_fields: { order_id: 1000 + i, location: 'New York' },
    created_at: new Date().toISOString()
}))

export async function fetchContacts({ page = 1, limit = 10 } = {}) {
    // In a real app, we would fetch from Supabase:
    // const { data, error, count } = await supabase
    //   .from('w_contacts')
    //   .select('*', { count: 'exact' })
    //   .range((page - 1) * limit, page * limit - 1)

    // Returning mock data for now
    const start = (page - 1) * limit
    const end = start + limit
    return {
        data: MOCK_CONTACTS.slice(start, end),
        count: MOCK_CONTACTS.length,
        error: null
    }
}

export async function createContact(contact) {
    // Mock creation
    return { data: { ...contact, id: `new-${Date.now()}` }, error: null }
}
