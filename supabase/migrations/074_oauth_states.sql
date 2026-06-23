-- oauth_states: temporary store for OAuth CSRF state tokens.
-- Replaces the in-memory Map in connectors.ts so that multiple
-- API instances all read/write the same state (no cross-instance failures).
CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT        PRIMARY KEY,
  tenant_id     UUID        NOT NULL,
  platform      TEXT        NOT NULL,
  code_verifier TEXT,
  return_to     TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON oauth_states (expires_at);
