-- Team members and invitations for multi-user workspaces.
-- The tenant owner is identified by tenants.clerk_user_id.
-- Additional seats are tracked in team_members.
-- Pending invitations live in team_invites until accepted/revoked/expired.

CREATE TABLE team_members (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clerk_user_id  TEXT        NOT NULL UNIQUE, -- one person, one workspace
  role           TEXT        NOT NULL DEFAULT 'member',
  invited_by     TEXT        NOT NULL,        -- clerk_user_id of the inviter
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON team_members(tenant_id);

CREATE TABLE team_invites (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id            UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invited_by_clerk_id  TEXT        NOT NULL,
  invitee_email        TEXT        NOT NULL,
  token                TEXT        NOT NULL UNIQUE,
  status               TEXT        NOT NULL DEFAULT 'pending',
  -- status: pending | accepted | revoked | expired
  created_at           TIMESTAMPTZ DEFAULT now(),
  expires_at           TIMESTAMPTZ DEFAULT now() + interval '7 days',
  accepted_at          TIMESTAMPTZ
);

CREATE INDEX ON team_invites(tenant_id);
CREATE INDEX ON team_invites(token);
