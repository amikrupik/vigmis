-- Chat messages
create table if not exists chat_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists chat_messages_tenant_created_at
  on chat_messages(tenant_id, created_at desc);

alter table chat_messages enable row level security;

create policy "tenant chat messages"
  on chat_messages for all
  using (tenant_id = (select id from tenants where clerk_user_id = auth.uid()::text));

-- Feedback submissions
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  trigger     text not null,  -- 'day7' | 'periodic' | 'post_optimization' | 'manual'
  rating      smallint check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now()
);

alter table feedback enable row level security;

create policy "tenant feedback"
  on feedback for all
  using (tenant_id = (select id from tenants where clerk_user_id = auth.uid()::text));

-- Track last feedback prompt shown per tenant
alter table tenants
  add column if not exists last_feedback_at timestamptz,
  add column if not exists onboarded_at     timestamptz;
