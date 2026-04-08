# Vigmis — System Architecture

> Version: 0.1 | Status: Planning | Last updated: 2026-04-02

---

## Core Principles

1. **Config-driven** — no hardcoded URLs, credentials, or provider names. Everything in config files.
2. **Provider-agnostic** — AI, storage, email, cloud: all behind interfaces. Swap without touching business logic.
3. **Environment-portable** — same codebase runs on laptop, staging server, or GCP with one config change.
4. **Modular, not fragmented** — clear modules, but not hundreds of micro-files. Each module is a folder.
5. **i18n-first** — all user-facing strings in language files. UI language is a runtime choice.
6. **Backup by default** — automated, versioned, restorable.

---

## Folder Structure

```
vigmis/
│
├── apps/
│   ├── web/                        # Frontend — Next.js + Tailwind
│   │   ├── app/                    # Pages (App Router)
│   │   ├── components/             # UI components
│   │   ├── hooks/                  # React hooks
│   │   └── public/                 # Static assets
│   │
│   └── api/                        # Backend — Node.js + TypeScript
│       ├── routes/                 # HTTP route handlers
│       ├── services/               # Business logic (one file per domain)
│       ├── workers/                # Background jobs (optimization loops)
│       ├── middleware/             # Auth, rate limiting, logging
│       └── server.ts               # Entry point
│
├── packages/                       # Shared modules (used by both apps)
│   │
│   ├── ai-router/                  # AI abstraction layer
│   │   ├── providers/
│   │   │   ├── openai.ts
│   │   │   ├── claude.ts
│   │   │   ├── gemini.ts
│   │   │   └── llama.ts
│   │   ├── router.ts               # Task → model routing logic
│   │   └── index.ts                # Public API
│   │
│   ├── ad-connectors/              # Ad platform integrations
│   │   ├── google/
│   │   │   ├── auth.ts             # OAuth flow
│   │   │   ├── campaigns.ts        # CRUD campaigns
│   │   │   ├── reporting.ts        # Pull metrics
│   │   │   └── index.ts
│   │   ├── meta/
│   │   │   ├── auth.ts
│   │   │   ├── campaigns.ts
│   │   │   ├── creatives.ts
│   │   │   └── index.ts
│   │   ├── tiktok/
│   │   │   └── ...
│   │   └── connector.interface.ts  # All connectors implement this
│   │
│   ├── billing/                    # Billing abstraction
│   │   ├── stripe.ts               # Stripe implementation
│   │   ├── billing.interface.ts    # Swap provider without breaking code
│   │   └── usage-tracker.ts        # Count clicks per client
│   │
│   ├── storage/                    # File/media storage abstraction
│   │   ├── local.ts                # Local disk (dev)
│   │   ├── gcs.ts                  # Google Cloud Storage (prod)
│   │   └── storage.interface.ts
│   │
│   ├── email/                      # Email abstraction
│   │   ├── sendgrid.ts
│   │   ├── resend.ts
│   │   └── email.interface.ts
│   │
│   └── i18n/                       # All language strings
│       ├── en.json                 # English (default)
│       ├── he.json                 # Hebrew
│       ├── ar.json                 # Arabic
│       ├── es.json                 # Spanish
│       └── index.ts                # Load language by key
│
├── config/                         # All configuration (no secrets here)
│   ├── app.config.ts               # App-level settings
│   ├── ai.config.ts                # Which AI for which task
│   ├── platforms.config.ts         # Which ad platforms are enabled
│   └── environments/
│       ├── .env.local              # Local dev (gitignored)
│       ├── .env.staging            # Staging server
│       └── .env.production         # Production (managed in cloud secrets)
│
├── infrastructure/                 # Deployment configs
│   ├── docker/
│   │   ├── Dockerfile.web
│   │   ├── Dockerfile.api
│   │   └── docker-compose.yml      # Local full-stack dev environment
│   ├── railway/                    # Railway deployment configs
│   └── gcp/                        # GCP configs (for later scale)
│       ├── cloudbuild.yaml
│       └── k8s/
│
├── docs/                           # Documentation (this folder)
│   ├── FEATURES.md
│   ├── ARCHITECTURE.md
│   └── LOG.md
│
├── scripts/                        # Utility scripts
│   ├── seed-db.ts                  # Populate dev DB with test data
│   ├── backup-db.ts                # Manual backup trigger
│   └── migrate.ts                  # Run DB migrations
│
├── package.json                    # Monorepo root
├── turbo.json                      # Turborepo build orchestration
└── .gitignore
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 + Tailwind + shadcn/ui | Fast, SEO-ready, great DX |
| Backend | Node.js + TypeScript + Fastify | Fast, typed, great for APIs |
| Database | PostgreSQL (via Supabase) | Relational, managed, free tier |
| Queue/Jobs | BullMQ + Redis | Reliable background workers |
| Auth | Clerk | OAuth, multi-tenant, zero config |
| Billing | Stripe | Industry standard |
| AI | OpenAI + Claude + Gemini (via ai-router) | Best of each model |
| Storage | GCS (prod) / local (dev) | Swappable via interface |
| Email | Resend | Simple, reliable |
| Monitoring | Sentry + Uptime Robot | Errors + availability |
| Hosting (MVP) | Railway (API) + Vercel (Web) | Zero DevOps, instant deploy |
| Hosting (Scale) | GCP GKE (Kubernetes) | When Railway isn't enough |

---

## Database Schema (High Level)

```
tenants            → one row per client company
users              → belong to a tenant, have roles
ad_accounts        → Google/Meta/TikTok credentials per tenant
campaigns          → campaigns managed by Vigmis
campaign_logs      → every change the optimizer made (reason + rollback data)
optimization_runs  → log of every 60-min cycle
ai_calls           → every AI request (model, tokens, cost, output)
billing_events     → every click counted, invoice, payment
alerts             → triggered alerts per tenant
i18n_overrides     → tenant-specific string overrides (optional)
```

---

## AI Router Logic

```typescript
// config/ai.config.ts — change this to swap models
export const AI_ROUTING = {
  copywriting:     "openai/gpt-4o",
  analysis:        "anthropic/claude-sonnet",
  imageGeneration: "openai/dall-e-3",
  seoContent:      "anthropic/claude-sonnet",
  cheapTasks:      "meta/llama-3",   // bulk, low-stakes
  fallback:        "openai/gpt-4o",
}
```

When a new model launches → update one line in `ai.config.ts`. Nothing else changes.

---

## Environment Portability

The entire system knows where it is via one environment variable: `APP_ENV=local|staging|production`

```
local      → SQLite or local Postgres, local file storage, no real emails sent
staging    → Supabase Postgres, GCS storage, real emails to test addresses
production → Supabase Postgres (or Cloud SQL), GCS, real everything
```

Moving from laptop → Railway → GCP = change `.env` file only.

---

## Backup Strategy

| What | How | Frequency | Retention |
|------|-----|-----------|-----------|
| Database | Supabase auto-backup | Daily | 30 days |
| Media files | GCS versioning | On upload | 90 days |
| Campaign state | Snapshot to DB before every optimizer run | Per run | 60 days |
| Code | Git (GitHub) | Every commit | Forever |
| Secrets | GCP Secret Manager | Versioned | Forever |

Recovery drill: restore from backup in <15 minutes.

---

## Scalability Path

```
Phase 1: Vercel + Railway + Supabase
  → 0–1,000 clients, zero DevOps, ~$200/month infra

Phase 2: Railway Pro + Supabase Pro
  → 1,000–10,000 clients, ~$1,500/month infra

Phase 3: GCP GKE (Kubernetes)
  → 10,000+ clients, full control, ~$5,000+/month infra
  → Migrate AI to self-hosted Llama (save 80% AI costs)

Phase 4: Multi-region GCP
  → 100,000+ clients, global, redundant
```

Migration between phases = infrastructure change only. Application code unchanged.

---

## Security

- All secrets in environment variables (never in code)
- OAuth tokens encrypted at rest (AES-256)
- Every API call authenticated (JWT)
- Row-level security in DB (tenant can only see their own data)
- Rate limiting on all public endpoints
- Audit log: every action stored with user ID + timestamp
- GDPR: data export and deletion endpoints built-in from day 1
