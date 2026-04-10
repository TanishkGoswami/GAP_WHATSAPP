-- Adds lightweight reactions support (WhatsApp-like) without creating reaction bubbles.
-- Stores aggregated reaction entries on the message row.

alter table public.messages
add column if not exists reactions jsonb not null default '[]'::jsonb;
