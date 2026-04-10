import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
    process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
    console.log("✅ Supabase client created");

    const { data: conversations, error: convErr } = await supabase
        .from('w_conversations')
        .select(
            `
            id,
            last_message_at,
            last_message_preview,
            unread_count,
            contact:contacts(name, phone, wa_id)
        `
        )
        .order("last_message_at", { ascending: false })
        .limit(10);

    if (convErr) throw convErr;

    if (!conversations || conversations.length === 0) {
        console.log("ℹ️ No conversations found in DB.");
        return;
    }

    console.log(`\n=== Recent Conversations (${conversations.length}) ===`);
    for (const c of conversations as any[]) {
        const name = c.contact?.name || c.contact?.wa_id || c.contact?.phone || "Unknown";
        console.log(`\n- Conversation: ${c.id}`);
        console.log(`  Contact: ${name}`);
        console.log(`  Last: ${c.last_message_preview || "(none)"}`);
        console.log(`  Last At: ${c.last_message_at}`);
        console.log(`  Unread: ${c.unread_count}`);

        const { data: msgs, error: msgErr } = await supabase
            .from('w_messages')
            .select("id, direction, type, content, status, created_at")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(5);

        if (msgErr) {
            console.log(`  ⚠️ Failed to fetch messages: ${msgErr.message}`);
            continue;
        }

        const ordered = (msgs || []).slice().reverse();
        for (const m of ordered as any[]) {
            const text = m.content?.text ?? (m.type ? `[${m.type}]` : "");
            console.log(`  - ${m.created_at} ${m.direction}: ${text} (${m.status})`);
        }
    }
}

main().catch((err) => {
    console.error("❌ Failed:", err);
    process.exit(1);
});
