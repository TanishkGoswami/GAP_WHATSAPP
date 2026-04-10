-- 1. Add 'assigned_to' column to conversations if it's missing
-- We use a DO block to check existence safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'conversations' 
        AND column_name = 'assigned_to'
    ) THEN
        ALTER TABLE public.conversations 
        ADD COLUMN assigned_to uuid REFERENCES auth.users(id);
    END IF;
END $$;

-- 2. Create conversation_reads table for multi-agent read tracking
CREATE TABLE IF NOT EXISTS public.conversation_reads (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  last_read_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(conversation_id, user_id)
);

-- 3. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_conversation_reads_lookup ON public.conversation_reads(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_last_msg ON public.conversations(organization_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON public.conversations(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at ASC);

-- 4. Fix potential type mismatch in bot_flows if needed (Optional, based on your schema)
-- ALTER TABLE public.bot_flows ALTER COLUMN organization_id TYPE uuid USING organization_id::uuid;
