-- Migration: Add bot_agents table and conversation bot settings
-- Date: 2026-01-27

-- 1. Create bot_agents table for storing AI bot configurations
CREATE TABLE IF NOT EXISTS public.bot_agents (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    model text DEFAULT 'gpt-3.5-turbo',
    temperature numeric(3,2) DEFAULT 0.7,
    trigger_keywords text[] DEFAULT ARRAY[]::text[],
    system_prompt text,
    knowledge_base text[] DEFAULT ARRAY[]::text[],
    knowledge_base_content jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add bot settings to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS bot_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS assigned_bot_id uuid REFERENCES public.bot_agents(id) ON DELETE SET NULL;

-- 3. Create openai_settings table for storing API keys per organization
CREATE TABLE IF NOT EXISTS public.openai_settings (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    api_key_encrypted text,
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_bot_agents_org ON public.bot_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_bot_agents_active ON public.bot_agents(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_conversations_bot_enabled ON public.conversations(bot_enabled) WHERE bot_enabled = true;

-- 5. Add trigger to update updated_at on bot_agents
CREATE OR REPLACE FUNCTION update_bot_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bot_agents_updated_at ON public.bot_agents;
CREATE TRIGGER trigger_bot_agents_updated_at
    BEFORE UPDATE ON public.bot_agents
    FOR EACH ROW
    EXECUTE FUNCTION update_bot_agents_updated_at();

-- 6. Enable RLS on bot_agents (optional, depends on your security model)
-- ALTER TABLE public.bot_agents ENABLE ROW LEVEL SECURITY;
