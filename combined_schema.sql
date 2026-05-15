-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  event_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.app_user_subscriptions (
  user_id uuid NOT NULL,
  telegram_user_id bigint,
  plan_id text,
  plan_label text,
  plan_price_paise bigint,
  plan_duration_days integer,
  last_payment_id text,
  last_payment_status text,
  last_payment_verified_at timestamp with time zone,
  started_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  total_cycles integer DEFAULT 1,
  raw jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT app_user_subscriptions_pkey PRIMARY KEY (user_id),
  CONSTRAINT app_user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.blog_categories (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text),
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT blog_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.blog_comments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL,
  author_name text NOT NULL,
  author_email text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'spam'::text, 'deleted'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT blog_comments_pkey PRIMARY KEY (id),
  CONSTRAINT blog_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id)
);
CREATE TABLE public.blog_post_tags (
  post_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT blog_post_tags_pkey PRIMARY KEY (post_id, tag_id),
  CONSTRAINT blog_post_tags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id),
  CONSTRAINT blog_post_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.blog_tags(id)
);
CREATE TABLE public.blog_posts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text,
  content text NOT NULL,
  featured_image text,
  status text NOT NULL DEFAULT 'published'::text,
  published_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_cms_post_id text,
  meta_title text CHECK (char_length(meta_title) <= 60),
  meta_description text CHECK (char_length(meta_description) <= 160),
  canonical_url text,
  category_id uuid,
  views bigint DEFAULT 0,
  likes bigint DEFAULT 0,
  author_name text,
  CONSTRAINT blog_posts_pkey PRIMARY KEY (id),
  CONSTRAINT blog_posts_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.blog_categories(id)
);
CREATE TABLE public.blog_tags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT blog_tags_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bot_agents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  description text,
  model text DEFAULT 'gpt-3.5-turbo'::text,
  temperature numeric DEFAULT 0.7,
  trigger_keywords ARRAY DEFAULT '{}'::text[],
  system_prompt text,
  knowledge_base ARRAY DEFAULT '{}'::text[],
  knowledge_base_content jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bot_agents_pkey PRIMARY KEY (id),
  CONSTRAINT bot_agents_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.bot_broadcast_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  status text DEFAULT 'pending'::text,
  sent_count integer DEFAULT 0,
  total_targeted integer DEFAULT 0,
  error_log text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bot_broadcast_progress_pkey PRIMARY KEY (id),
  CONSTRAINT bot_broadcast_progress_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.broadcast_tasks(id)
);
CREATE TABLE public.bot_channel_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL,
  channel_id text NOT NULL,
  channel_name text,
  channel_icon_url text,
  status text DEFAULT 'Active'::text,
  created_at timestamp with time zone DEFAULT now(),
  invite_link text,
  auto_approve boolean DEFAULT true,
  CONSTRAINT bot_channel_mappings_pkey PRIMARY KEY (id),
  CONSTRAINT bot_channel_mappings_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.telegram_tracker(id)
);
CREATE TABLE public.bot_detected_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bot_id uuid,
  channel_id text NOT NULL,
  channel_name text,
  channel_username text,
  channel_icon_url text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT bot_detected_channels_pkey PRIMARY KEY (id),
  CONSTRAINT bot_detected_channels_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.telegram_tracker(id)
);
CREATE TABLE public.bot_join_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  telegram_image_url text,
  telegram_message text,
  telegram_extra_message text,
  button_text text DEFAULT 'Join Channel'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  channel_mapping_id uuid,
  CONSTRAINT bot_join_links_pkey PRIMARY KEY (id),
  CONSTRAINT bot_join_links_channel_mapping_id_fkey FOREIGN KEY (channel_mapping_id) REFERENCES public.bot_channel_mappings(id),
  CONSTRAINT bot_join_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT bot_join_links_bot_id_fkey FOREIGN KEY (bot_tracker_id) REFERENCES public.telegram_tracker(id)
);
CREATE TABLE public.bot_join_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  link_id uuid NOT NULL,
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  telegram_first_name text,
  joined_channel boolean DEFAULT false,
  joined_at timestamp with time zone,
  left_channel boolean DEFAULT false,
  left_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  status text DEFAULT 'bot_started'::text,
  last_reminded_at timestamp with time zone,
  reminder_sent boolean DEFAULT false,
  rejoined_at timestamp with time zone,
  rejoin_count integer DEFAULT 0,
  is_bot_blocked boolean DEFAULT false,
  CONSTRAINT bot_join_users_pkey PRIMARY KEY (id),
  CONSTRAINT bot_join_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT bot_join_users_bot_id_fkey FOREIGN KEY (bot_tracker_id) REFERENCES public.telegram_tracker(id),
  CONSTRAINT bot_join_users_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.bot_join_links(id)
);
CREATE TABLE public.broadcast_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id text NOT NULL,
  message_data jsonb NOT NULL,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT broadcast_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT broadcast_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.broadcasts (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  caption text NOT NULL,
  video_filename text NOT NULL,
  status text NOT NULL DEFAULT 'sent'::text,
  -- Note: Other columns abbreviated for clarity --
  CONSTRAINT broadcasts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.channel_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  community_id bigint NOT NULL,
  landing_page_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  payment_id uuid,
  telegram_user_id bigint,
  status text DEFAULT 'active'::text,
  starts_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  landing_page_user_id uuid,
  CONSTRAINT channel_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT channel_subscriptions_landing_page_id_fkey FOREIGN KEY (landing_page_id) REFERENCES public.landing_pages(id)
);
CREATE TABLE public.chatbot_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL,
  user_id uuid NOT NULL,
  support_name text,
  business_info text,
  provider text,
  api_key text,
  knowledge_base_file_url text,
  knowledge_base_file_name text,
  status text DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chatbot_configs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chatbot_knowledge (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_knowledge_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chatbot_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  name text,
  email text,
  phone text,
  status text DEFAULT 'new'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_leads_pkey PRIMARY KEY (id),
  CONSTRAINT chatbot_leads_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chatbot_sessions(id)
);
CREATE TABLE public.chatbot_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chatbot_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chatbot_sessions(id)
);
CREATE TABLE public.chatbot_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatbot_sessions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.communities (
  id bigint NOT NULL DEFAULT nextval('communities_id_seq'::regclass),
  user_id uuid NOT NULL,
  telegram_chat_id bigint NOT NULL,
  title text NOT NULL,
  photo_url text,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  member_count integer DEFAULT 0,
  description text,
  join_mode text DEFAULT 'request'::text,
  invite_link text,
  CONSTRAINT communities_pkey PRIMARY KEY (id)
);
CREATE TABLE public.organization_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  organization_id uuid,
  user_id uuid NOT NULL,
  role text DEFAULT 'agent'::text CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'agent'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  name text,
  email text,
  is_active boolean DEFAULT true,
  avatar_color text,
  invite_token_hash text,
  invite_expires_at timestamp with time zone,
  invite_sent_at timestamp with time zone,
  invite_accepted_at timestamp with time zone,
  invite_temp_password_encrypted text,
  CONSTRAINT organization_members_pkey PRIMARY KEY (id),
  CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  industry text,
  website text,
  subscription_tier text NOT NULL DEFAULT 'free'::text CHECK (subscription_tier = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text])),
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  is_active boolean DEFAULT true,
  plan_id text,
  plan_start_date timestamp with time zone,
  plan_end_date timestamp with time zone,
  max_users integer DEFAULT 5,
  max_contacts integer DEFAULT 1000,
  plan_status text DEFAULT 'active'::text CHECK (plan_status = ANY (ARRAY['active'::text, 'inactive'::text, 'trial'::text, 'suspended'::text])),
  billing_cycle text DEFAULT 'monthly'::text CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text])),
  auto_renew boolean DEFAULT true,
  custom_features jsonb DEFAULT '{}'::jsonb,
  trial_ends_at timestamp with time zone,
  settings jsonb DEFAULT '{"has_hr": true, "has_billing": true, "has_calendar": true, "has_attendance": true, "setup_completed": true}'::jsonb,
  CONSTRAINT organizations_pkey PRIMARY KEY (id)
);
-- ... Other tables included from your schema dump
