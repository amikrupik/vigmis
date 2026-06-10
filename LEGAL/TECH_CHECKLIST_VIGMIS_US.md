# VIGMIS US LLC — Technical & Operational Checklist

## Status: Waiting for LLC Formation + EIN

---

## Phase 1: LLC Formed + EIN Received

### Code Changes (one sprint, ~4 hours)

| File | Change Required |
|------|----------------|
| `apps/web/app/terms/page.tsx` | Contracting party → VIGMIS US LLC, Wyoming, USA |
| `apps/web/app/privacy/page.tsx` | Data Controller → VIGMIS US LLC. Taurus → Sub-processor |
| `apps/web/app/contact/page.tsx` | Company address → VIGMIS US LLC + Registered Agent address |
| `apps/web/app/components/PublicFooter.tsx` | © → VIGMIS US LLC |
| `apps/api/src/routes/export.ts` (line 591) | Invoice seller → VIGMIS US LLC + EIN |

### Stripe (~2 hours)
- [ ] Open new Stripe account under VIGMIS US LLC
- [ ] Configure: business name, support email, statement descriptor = "VIGMIS"
- [ ] Create new Product + Price (Live mode) — replace prod_Ufby... and price_1TgG...
- [ ] Create new Webhook endpoint for production URL
- [ ] Replace Railway env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID

### Privacy Policy (legal help recommended)
- [ ] Full GDPR-compliant Privacy Policy identifying VIGMIS US LLC as Controller
- [ ] List Sub-processors: Taurus, Supabase, Clerk, OpenAI, Anthropic, Railway, Cloudflare
- [ ] Data transfer mechanism (US → Israel): SCCs or equivalent
- [ ] CCPA section for California users
- [ ] DPA contact: privacy@vigmis.com

---

## Phase 2: Stripe Live Working

### Stripe Tax (~3 hours)
- [ ] Enable Stripe Tax in Stripe Dashboard
- [ ] Add `automatic_tax: { enabled: true }` to all subscription + invoice creation in `billing/stripe.ts`
- [ ] Update onboarding to collect customer country (required for Stripe Tax)
- [ ] Test Stripe Tax calculation in test mode before going live
- [ ] Decide: tax-inclusive vs tax-exclusive pricing

### Invoice Completeness
Invoice must include per tax regulations:
- [ ] VIGMIS US LLC (seller name)
- [ ] VIGMIS US LLC registered address
- [ ] EIN (seller tax ID)
- [ ] Customer name + address
- [ ] VAT/Tax number field for B2B EU customers
- [ ] Tax amount line (Stripe Tax handles this)
- [ ] Invoice number (VIG-YYYYMM-XXXX ✓ already exists)

---

## Phase 3: EU Customers

### EU VAT OSS
- [ ] Register for EU VAT OSS (recommended country: Ireland or Netherlands)
- [ ] Stripe Tax generates country-by-country reports for OSS filing
- [ ] Quarterly OSS filing

### B2B EU Customers
- [ ] Add VAT number collection to onboarding
- [ ] Configure Stripe Tax to apply reverse charge for validated EU VAT numbers
- [ ] Test with Irish, German, French VAT numbers

---

## Phase 4: Scale ($100K+ ARR)

### Accounting
- [ ] QuickBooks or Xero for US entity books
- [ ] Connect Stripe → accounting software
- [ ] Monthly reconciliation: Gross Revenue → deductions → Net Revenue → 75/25 split
- [ ] Annual: Form 1120 (US) + Form 5472 (IRS foreign-owned LLC)

### Transfer Pricing
- [ ] Formal Transfer Pricing Memo (arm's length documentation for 75/25 split)
- [ ] US CPA review
- [ ] Israeli tax advisor review of CFC implications

---

## Notes

### What does NOT change with entity switch
- Domain: vigmis.com stays
- Branding: VIGMIS stays (VIGMIS US LLC = legal name, trade name = VIGMIS)
- Railway infrastructure: stays
- Supabase: stays
- All code logic: stays

### Where Taurus should still appear
- In Privacy Policy as Sub-processor / Data Processor
- In Intercompany Agreement (internal document)
- In corporate disclosure if legally required (beneficial ownership)
- NOT in customer-facing ToS, invoices, footer

### Stripe Tax — estimated cost
Stripe charges 0.5% on transactions where tax is calculated.
On $10,000 monthly revenue → ~$50/month if all customers are taxable.
In early stages, most B2B customers provide VAT numbers (reverse charge = no Stripe Tax fee).
