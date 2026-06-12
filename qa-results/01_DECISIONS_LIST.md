# DECISIONS LIST — QA Session 2026-06-11
## For: Ami | Priority: Review before fixing bugs

---

### DECISION-01: Currency handling — what to do when English user says "$8,000"?

**Current behavior**: Auto-converts to ILS and displays both: "$8,000/month = ~₪29,600/month"
**Problem**: US/international clients shouldn't see ILS. This is wrong for B2B SaaS, global e-commerce, US hero products.

Options:
- **A)** Always ask "Is that USD, ILS, or another currency?" before displaying conversion (+1 turn, eliminates all ambiguity)
- **B)** Infer from session language: Hebrew session → assume ILS (and confirm), English session → assume USD (no conversion shown)
- **C)** Accept amount as-is, show dual currencies only if user requests

**Recommendation: B** — English session = USD assumed, no ILS conversion shown. Hebrew session = ILS assumed, confirm if $ symbol used.

---

### DECISION-02: What happens when the website can't be scraped?

**Current behavior**: HTTP 422, zero strategy output. open_notes context is ignored.
**Problem**: 4 of 7 tested personas got this error. Wix/Squarespace = majority of Israeli SMBs.

Options:
- **A)** Keep 422 hard fail (maintains quality, blocks real users — not viable)
- **B)** Fall back to open_notes + business_type to generate partial strategy with disclaimer ("Based on your description, not website scan:")
- **C)** Show user a form to describe their business manually, submit that, re-run analysis

**Recommendation: B immediately + C as follow-up** — B unblocks the use case today, C adds self-service quality path later.

---

### DECISION-03: Firearms and other sensitive categories — what is Vigmis's policy?

**Current behavior**: Accepts all businesses, no content policy gate. This is the critical one.
**Evidence from QA**: Persona H (SafeShoot USA, legal firearms safety business) was accepted without any warning, review, or platform restriction notice. AI even suggested Meta as an ad platform — Meta categorically bans firearms accessories. Account ban guaranteed on day 1.

Options:
- **A)** Accept all legal firearms businesses — add prominent platform restriction warnings, mandatory age gates, geo-legal compliance notes, human review before any ad runs
- **B)** Accept only firearms safety/education (not accessories/sales) — mandatory compliance attestation, no Meta recommendation, human review
- **C)** Refuse all firearms-related businesses at onboarding — cleanest MVP policy, lowest platform risk

**Recommendation: C for MVP**. The platform risk of a single Meta policy violation during the growth phase is existential. Publisher Shield is not yet operational. Add B as an option after Publisher Shield is live and the legal framework (ToS, attestation) is complete.

This decision must be made BEFORE any user can complete onboarding.

---

### DECISION-04: Minimum budget enforcement — when should Vigmis push back?

**Current behavior**: Accepts any budget (including 150 ILS/month ≈ $40). No warning given.
**Problem**: Users with budgets below a viable threshold will see zero results → churn + support burden + refund requests.

Options:
- **A)** Hard block: below ₪X/month, user cannot proceed
- **B)** Soft warning: "Your budget is below our recommended minimum of ₪X — results may be very limited" + allow continuation
- **C)** No minimum (current behavior)

**Recommendation: B** — what should ₪X be? Suggested: ₪500/month ($135) as the absolute floor where any meaningful learning data can be collected.

Need your input: what is the minimum budget you'd accept? ₪300? ₪500? ₪1,000?

---

### DECISION-05: finalSettings trigger — how does onboarding "close"?

**Current behavior**: finalSettings is never set. Bug or missing feature?
**Root cause**: coveredTopics never updates → system never knows when onboarding is complete.

Options:
- **A)** Auto-close: after all required topics in coveredTopics are marked, auto-commit settings
- **B)** AI-triggered: after AI detects onboarding completion intent ("let me summarize..."), it emits finalSettings
- **C)** User-triggered: UI shows "Confirm and Build Strategy" CTA — clicking it commits settings

**Recommendation: A + C** — Fix coveredTopics tracking first (BUG-002), then require all mandatory topics covered, then show user a summary + Confirm button before committing.

---

### DECISION-06: LinkedIn for B2B clients — should it be in the platform mix?

**Current behavior**: Platform recommendations are Google + Meta only for all business types.
**Problem**: B2B SaaS in North America/Western Europe — LinkedIn is the primary channel for demos, trials, and pipeline. Recommending Google+Meta only is a factual strategic error.

Options:
- **A)** Auto-add LinkedIn to recommendations when business_type = saas or B2B lead-gen
- **B)** Present as option during onboarding ("Would you like to include LinkedIn?")
- **C)** Leave as-is (Google + Meta only)

**Recommendation: A** — LinkedIn is not a nice-to-have for B2B SaaS in NA/WEU. It's the primary channel. This is a factual gap, not a preference.

---

## BUG PRIORITY (for dev queue, after decisions above)

| Priority | Bug | Impact |
|---|---|---|
| P0 | BUG-001+002: finalSettings+coveredTopics never set | Zero data persisted from any onboarding |
| P0 | BUG-003: Strategy API 422 with no open_notes fallback | 4/7 personas blocked from strategy |
| P0 | BUG-004: USD auto-converted to ILS without asking | Wrong for all English-language sessions |
| P0 | BUG-010: Content policy classifier silent on firearms | Platform risk if any sensitive client onboards |
| P1 | BUG-007: creative_briefs always empty | Core deliverable missing |
| P1 | BUG-008: strategy_narrative always empty | Required field missing |
| P1 | BUG-006: market_insights truncated to 200 chars | Strategy object has stub not full data |
| P1 | BUG-011: Business type disambiguation loop | 6-turn loop blocks users (Personas E, H) |
| P2 | BUG-012: Crisis support contact is placeholder | No escalation path for emergencies |
| P2 | BUG-013: Micro budget not flagged | False expectation, causes churn |
| P2 | BUG-005: Summary in English despite Hebrew session | Language consistency |
| P2 | BUG-014: Language switch resets onboarding | UX disruption |
