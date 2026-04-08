# Vigmis — Product & Architecture Decisions

> This file is the authoritative record of every significant product and technical decision.
> Updated before each build stage begins. Never delete entries — add corrections as new entries.

---

## Stage 2 Decisions — 2026-04-05

---

### D-001: Onboarding Format

**Decision:** Onboarding is a conversational AI agent, not a static form.

**How it works:**
- AI conducts a natural interview — text or voice
- 5 required topics must be covered before the AI concludes:
  1. `budget` — monthly ad spend in ILS
  2. `goal` — what counts as success: leads / purchases / traffic / awareness
  3. `geography` — where to target and where NOT to target (territories + populations)
  4. `exclusions` — what the system must never do (audiences, tone, competitors, legal)
  5. `open_notes` — anything else important (e.g., dayparting, special rules)
- AI asks follow-up questions when answers are vague
- AI infers what it can from context (e.g., "religious audience in Jerusalem" → infers geography)
- At the end, AI outputs a structured JSON summary
- Client reviews the summary and confirms before anything is saved

**Why:** The AI that reads the answers can clarify, infer, and extract structured data better than a form. Voice input makes onboarding faster and more natural.

**Input:** Text + voice (Web Speech API, browser-native, no extra service)

---

### D-002: AI Routing Logic

**Decision:** Claude for analysis/reasoning, GPT for writing/creativity. Always a fallback.

| Task | Model | Reason |
|------|-------|--------|
| copywriting | openai/gpt-4o | Best creative writing, Hebrew support |
| analysis | anthropic/claude-sonnet-4-5 | Long-document analysis, reasoning |
| market_research | openai/gpt-4o | Broad information synthesis |
| image_generation | openai/dall-e-3 | Only option for MVP |
| seo_content | anthropic/claude-sonnet-4-5 | Structured, factual long-form content |
| optimization_decision | anthropic/claude-sonnet-4-5 | Cautious reasoning over data |
| report_generation | anthropic/claude-sonnet-4-5 | Structured long-form output |
| cheap_task | openai/gpt-4o-mini | Cost efficiency |

**Fallback rule:** If a provider is unavailable → fall back to `openai/gpt-4o`. Always.

**Hebrew:** Both GPT-4o and Claude handle Hebrew well. No special routing needed.

---

### D-003: Approval Gate

**Decision:** 3 risk levels set by client during onboarding. Client chooses at onboarding time.

#### Risk Levels

| Level | Auto-approved | Requires approval |
|-------|--------------|-------------------|
| Conservative | Nothing | Everything |
| Balanced (default) | Pause weak ad, bid ±20%, dayparting | New campaign, budget +20%, new creative, pause entire campaign |
| Aggressive | Most optimizations | Budget +50%, new campaign, pause entire campaign |

#### Hard Rules (apply regardless of risk level)
- First campaign ever → always manual approval
- Pausing an entire campaign → always manual approval
- Exceeding the defined budget cap → system stops, does NOT self-approve

#### Timeouts
- 48h without response → reminder notification
- 72h without response → action is cancelled (system never self-approves)

#### Notifications (MVP)
- Dashboard notification + email
- No WhatsApp for MVP

---

### D-004: Token Storage

**Decision:** OAuth tokens (Google Ads, Meta) are encrypted at rest using AES-256-GCM.

- Encryption key: `TOKEN_ENCRYPTION_KEY` env var (32 bytes, hex-encoded = 64 chars)
- Stored in Supabase `platform_tokens` table, encrypted fields: `access_token`, `refresh_token`
- Only the API (service role) can read/write tokens
- Web frontend never receives raw tokens

---

### D-005: Multi-tenancy Model

**Decision:** Clerk user ID is the tenant identifier. API enforces isolation in application code.

- Supabase is accessed via service role key from the API only
- Every DB query in the API filters by `tenant_id` derived from the verified Clerk JWT
- RLS is enabled in Supabase as a second layer, but primary enforcement is in the API
- Web frontend never calls Supabase directly (no anon key in production)

---

### D-006: Onboarding Conversation Language

**Decision:** AI detects and mirrors the client's language automatically.

- If client writes/speaks Hebrew → AI responds in Hebrew
- If client writes/speaks English → AI responds in English
- Structured summary is always output in the same language
- Stored `open_notes` and `exclusions` are stored as-is (the language the client used)

---
