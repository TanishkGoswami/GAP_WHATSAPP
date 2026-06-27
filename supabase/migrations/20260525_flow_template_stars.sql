-- Create GitHub-style stars for built-in flow templates.
-- Safe to run multiple times.

create table if not exists public.w_flow_template_stars (
  id uuid primary key default gen_random_uuid(),
  template_id text not null,
  organization_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  unique(template_id, user_id)
);

create index if not exists idx_w_flow_template_stars_template
  on public.w_flow_template_stars(template_id);

create index if not exists idx_w_flow_template_stars_org
  on public.w_flow_template_stars(organization_id, created_at desc);

comment on table public.w_flow_template_stars is 'GitHub-style stars for built-in flow templates.';

notify pgrst, 'reload schema';
