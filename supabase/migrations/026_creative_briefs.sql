-- Migration 026: Creative Briefs
--
-- One row per hero product per tenant. The brief defines the strategic
-- framing every creative will use: pain, promise, proof, objection.
--
-- Without a brief, "generate 5 variations" produces 5 different generic
-- failures. With a brief, every creative aligns to one specific pain →
-- promise → proof → objection arc, which is how human copywriters work.

CREATE TABLE IF NOT EXISTS creative_briefs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Subject of the brief
  product_name      TEXT NOT NULL,            -- the hero product or service this brief is for
  product_slug      TEXT,                     -- url-safe identifier
  is_default        BOOLEAN NOT NULL DEFAULT false, -- one brief per tenant marked default

  -- The 4-corner brief
  audience_pain     TEXT NOT NULL,    -- what's broken in the customer's life today
  promise           TEXT NOT NULL,    -- the change this product creates
  proof             TEXT NOT NULL,    -- why they should believe the promise (testimonials, data, mechanism)
  objection_to_kill TEXT NOT NULL,    -- the main reason they'd say "no, not for me"

  -- Optional supporting framing
  emotional_hook    TEXT,             -- the feeling we're trying to evoke
  rational_hook     TEXT,             -- the logical argument
  forbidden_angles  TEXT[],           -- angles we should NOT use (e.g. "weight loss before-after")

  -- Source
  source            TEXT NOT NULL DEFAULT 'ai_extracted'
                    CHECK (source IN ('ai_extracted','customer_provided','customer_edited','imported')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, product_slug)
);

CREATE INDEX IF NOT EXISTS creative_briefs_tenant ON creative_briefs(tenant_id);
CREATE INDEX IF NOT EXISTS creative_briefs_default
  ON creative_briefs(tenant_id) WHERE is_default = true;

ALTER TABLE creative_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON creative_briefs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
