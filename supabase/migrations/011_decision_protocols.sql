-- 011: Decision Protocols
-- Full audit trail of every significant Vigmis recommendation and client decision.
-- Every budget change, campaign pause, scale action, or strategic advice
-- goes through a documented protocol: recommendation → discussion → formal approval.

create table if not exists decision_protocols (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,

  -- Protocol type
  type                text not null check (type in (
    'strategy_approval',   -- onboarding plan approval
    'budget_change',       -- increase or decrease budget
    'campaign_pause',      -- pause a campaign
    'campaign_resume',     -- resume a campaign
    'campaign_scale',      -- scale up or down
    'creative_refresh',    -- new creative needed
    'targeting_review',    -- targeting/keywords need change
    'stagnation_alert',    -- long-term underperformance
    'general_advice'       -- any other Vigmis recommendation
  )),

  status              text not null default 'pending' check (status in (
    'pending',     -- awaiting client response
    'in_discussion', -- client has replied, conversation ongoing
    'approved',    -- client formally approved
    'rejected',    -- client rejected
    'expired'      -- no response after 7 days
  )),

  -- The recommendation Vigmis made
  title               text not null,
  recommendation      text not null,          -- full text of what Vigmis recommends

  -- Conversation thread: array of { role: 'vigmis'|'client', content, timestamp }
  conversation        jsonb not null default '[]',

  -- Formal approval: shown to client on the approval button
  approval_text       text not null,          -- "I approve pausing campaign X and..."
  approval_summary    text,                   -- one-line summary of what was approved

  -- The action to execute when approved
  action_payload      jsonb not null default '{}',  -- { campaignId, newBudget, platform, ... }

  -- Which campaign this relates to (optional)
  campaign_id         uuid references campaigns(id) on delete set null,
  platform            text,

  -- Resolution
  resolved_at         timestamptz,
  resolved_by         text default 'client',  -- 'client' | 'system' | 'expired'

  expires_at          timestamptz not null default (now() + interval '7 days'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_decision_protocols_tenant_status
  on decision_protocols(tenant_id, status);

create index if not exists idx_decision_protocols_tenant_created
  on decision_protocols(tenant_id, created_at desc);

alter table decision_protocols enable row level security;

create policy "Tenants manage own decision protocols"
  on decision_protocols
  for all
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
