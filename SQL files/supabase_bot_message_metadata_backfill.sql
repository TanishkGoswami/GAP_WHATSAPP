-- Backfill bot metadata for older rows where the app stored it inside content JSON.
-- Run this once in Supabase SQL Editor after deploying the backend change.

update public.w_messages
set
  is_bot_reply = true,
  bot_agent_id = case
    when content->>'bot_agent_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (content->>'bot_agent_id')::uuid
    else bot_agent_id
  end
where
  coalesce(is_bot_reply, false) = false
  and direction = 'outbound'
  and (
    content @> '{"is_flow": true}'::jsonb
    or content ? 'bot_agent_id'
    or content ? 'is_bot_reply'
  );

update public.w_messages
set bot_agent_id = (content->>'bot_agent_id')::uuid
where
  bot_agent_id is null
  and content->>'bot_agent_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
