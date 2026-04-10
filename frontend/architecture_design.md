# WhatsApp-like Shared Inbox Architecture Design

## 1. Database Extensions

To support the multi-agent read state and optimize query performance, we need to extend the current schema.

### New Table: `conversation_reads`
This table tracks the read state for each agent (user) per conversation.

```sql
create table if not exists public.conversation_reads (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  last_read_message_id uuid references public.messages(id) on delete set null,
  last_read_at timestamptz default now(),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(conversation_id, user_id)
);

-- Index for quick lookups during list rendering
create index idx_conversation_reads_lookup on public.conversation_reads(user_id, conversation_id);
```

### Additional Indexes & Constraints
Ensure these exist to support high-performance "Inbox" queries.

```sql
-- For sorting the inbox by most recent activity
create index if not exists idx_conversations_org_last_msg on public.conversations(organization_id, last_message_at desc);

-- For filtering by assigned agent
create index if not exists idx_conversations_assigned on public.conversations(assigned_to) where assigned_to is not null;

-- For fast retrieval of messages in a thread
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at asc);
```

---

## 2. Event Ingestion Flow (Inbound)

When a webhook is received from WhatsApp (Meta/Baileys):

1.  **Lookup/Upsert Contact**:
    *   Match `wa_id` (phone number) + `organization_id`.
    *   Update `last_active`.
2.  **Lookup/Upsert Conversation**:
    *   **Logic**: Find existing conversation by `wa_account_id` + `contact_id`.
    *   **Updates**:
        *   `last_message_at`: `NOW()`
        *   `last_message_preview`: Truncated body of the incoming message.
        *   `unread_count`: `unread_count + 1` (This is the *global* unread count).
        *   `status`: If `closed`, re-open it to `open`.
3.  **Insert Message**:
    *   `direction`: `'inbound'`
    *   `status`: `'delivered'`
4.  **Real-time Event**:
    *   Emit `inbound_message` event to the specific Organization Room in Supabase Realtime / Socket.io.

## 3. Outbound Flow

When an agent sends a message via API:

1.  **Insert Message**:
    *   `direction`: `'outbound'`
    *   `status`: `'sent'` (initially pending until ACK).
2.  **Call WhatsApp API**:
    *   Send the payload to Meta/Baileys.
3.  **Update Conversation**:
    *   `last_message_at`: `NOW()`
    *   `last_message_preview`: Truncated body.
    *   `unread_count`: `0` (Optional: sending a reply usually "reads" the thread globally, but for multi-agent, we just leave it or reset it. **Recommended**: Reset global `unread_count` to 0 on outbound).
4.  **Handle Async Status Updates** (Webhook Callback):
    *   Receive `sent` / `delivered` / `read` status from WhatsApp.
    *   Update `messages.status` where `wa_message_id` matches.
    *   Emit `message_status_update` event.

## 4. API Response DTOs

### Conversation List Item (GET /api/conversations)
```typescript
interface ConversationListItem {
  id: string; // uuid
  contact: {
    id: string;
    wa_id: string; // Phone number
    name: string | null;
    avatar_url?: string;
  };
  last_message: {
    content: string; // preview
    created_at: string; // ISO date
    sender_name?: string; // If agent sent it
  };
  unread_count: number; // Global unread count
  assigned_to: string | null; // Agent UUID
  status: 'open' | 'pending' | 'closed';
  labels: string[];
  // Calculated field for the current user
  user_has_read: boolean; 
}
```

### Message List Item (GET /api/messages/:id)
```typescript
interface MessageItem {
  id: string;
  wa_message_id: string | null;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template';
  content: any; // JSON body
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error_message?: string;
  created_at: string;
  sender?: {
    name: string;
  }; // If outbound, which agent sent it (if tracked in metadata)
}
```

## 5. Exact Logic for Unread Count (Multi-Agent)

The "Bold" unread state in the UI for **current_user** is determined by comparing the conversation's `last_message_at` with the user's `conversation_reads.last_read_at`.

**SQL Logic (View or Query)**:
```sql
SELECT 
  c.*,
  (CASE 
     WHEN cr.last_read_at IS NULL THEN true
     WHEN cr.last_read_at < c.last_message_at THEN true
     ELSE false
   END) as is_unread_by_user
FROM conversations c
LEFT JOIN conversation_reads cr 
  ON c.id = cr.conversation_id AND cr.user_id = :current_user_id
WHERE c.organization_id = :org_id;
```

**API Action (Mark as Read)**:
*   **Endpoint**: `POST /api/conversations/:id/read`
*   **Action**: Upsert into `conversation_reads` setting `last_read_at = NOW()` and `last_read_message_id = {latest_message_id}`.

## 6. Real-time Update Strategy

We will use **Supabase Realtime** for the "Global Source of Truth" and data synchronization.

1.  **Clients Sync**:
    *   Subscribe to `postgres_changes` on `messages` table (INSERT, UPDATE).
    *   Subscribe to `postgres_changes` on `conversations` table (UPDATE).
2.  **Handling Events**:
    *   **INSERT Message**: Append to message list if thread open. Update conversation preview in sidebar.
    *   **UPDATE Message** (Status change `sent` -> `delivered`): Update checkmarks in UI.
    *   **UPDATE Conversation**: Move thread to top of sidebar. Update badge.

*Why not just Socket.io?*
Since we are using Supabase, the Realtime engine is built-in and consistent with the database state. It avoids the need to manually emit events from the backend for every single DB action (like status updates that come from webhooks). Frontend simply "listens to the database".

However, since `server.ts` already has `socket.io` set up, we can use it for **Ephemeral** events (Typing indicators: `user_typing`), while relying on Supabase for **Data Consistency**.
