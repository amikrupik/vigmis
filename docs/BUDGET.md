# Vigmis — Budget Analysis

> Last updated: 2026-04-05
> This is a living document. Update after each beta measurement.

---

## 3 Separate Budgets

### A. MVP Development (one-time, ~3 months)

| Item | Monthly | 3 Months |
|------|---------|----------|
| Claude Code (AI coding assistant) | ~$100–200 | ~$400–600 |
| OpenAI API (dev/testing) | ~$30–80 | ~$120–240 |
| Railway staging server | ~$20 | ~$60 |
| Vercel (free tier) | $0 | $0 |
| Supabase (free tier) | $0 | $0 |
| Domain + misc | ~$15 | ~$45 |
| **Total** | | **~$625–945** |

### B. Beta — 3 Clients (monthly recurring)

| Item | Lean | Base | Aggressive |
|------|------|------|-----------|
| Railway (API + Redis) | $20 | $50 | $100 |
| Supabase Pro | $25 | $25 | $25 |
| OpenAI — onboarding ×3 | $15 | $40 | $80 |
| OpenAI — optimization loops (daily) | $10 | $30 | $90 |
| OpenAI — weekly reports | $5 | $15 | $40 |
| Clerk Pro | $25 | $25 | $25 |
| **Total/month** | **$100** | **$185** | **$360** |

### C. Per-Client Monthly Operating Cost

| Action | AI Cost | Frequency | Monthly |
|--------|---------|-----------|---------|
| Full onboarding (one-time) | ~$3–8 | ×1 | — |
| Optimization loop (every 60 min) | ~$0.05–0.15 | ×720 | $36–108 |
| Weekly report | ~$0.50–1.50 | ×4 | $2–6 |
| Site re-analysis | ~$1–3 | ×1–2 | $1–6 |
| Creative suggestion | ~$0.20–0.50 | ×10 | $2–5 |
| **AI total per client/month** | | | **$41–125** |
| Infrastructure share | | | $10–20 |
| **Total cost per client** | | | **$51–145** |

---

## Revenue vs. Cost Analysis

| Client Type | Clicks/month | Revenue | Cost | Margin |
|-------------|-------------|---------|------|--------|
| Base, light | 200 clicks | $30 | $51 | **negative** |
| Base, normal | 500 clicks | $75 | $80 | **break-even** |
| Base, heavy | 1,000 clicks | $150 | $100 | **$50** |
| Pro, light | 200 clicks | $39 | $51 | **negative** |
| Pro, normal | 500 clicks | $75 | $80 | **break-even** |
| Pro, heavy | 1,000 clicks | $135 | $100 | **$35** |

**Insight:** Vigmis only makes money with active clients (500+ clicks/month).
Light clients at base plan = loss. Need minimum usage tier or base monthly fee.

---

## Critical Cost Guardrails (must build into system)

- Max optimization loop AI calls: check if data changed before calling AI
- Cache similar optimization decisions (same conditions = same answer)
- Min 50 data points before making any bid/budget change
- Monthly AI token cap per client (configurable per plan)
- Dry-run mode during beta: log decisions without executing

---

## Notes
- Numbers are estimates. Measure actual costs during beta and update this doc.
- Optimization loop is the biggest cost driver — this needs careful engineering.
- Consider: minimum monthly spend commitment for base plan (~$20/month base fee).
