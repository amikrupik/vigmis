-- 010: Approval Requests table for conservative optimization mode
-- Stores pending optimization actions that require user approval

create table if not exists approval_request (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  action_type  text not null,           -- scale_up | scale_down | needs_creative
  platform     text,
  payload      jsonb default '{}',
  status       text not null default 'pending',  -- pending | approved | rejected | expired
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists idx_approval_request_tenant_status
  on approval_request(tenant_id, status);

-- RLS: tenants only see their own requests
alter table approval_request enable row level security;

create policy "Tenants manage own approval requests"
  on approval_request
  for all
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
