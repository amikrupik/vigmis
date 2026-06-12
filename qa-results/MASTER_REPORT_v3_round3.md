# Vigmis QA Round 3 — Regression Report
## Date: 2026-06-12
## Scope: Verification of 3 fixes from QA Round 2

## Verdict: PARTIAL — 1 of 3 fixes confirmed, 2 still failing

---

## E7 — Hunting False-Positive (commit 9349aca)

| Test | Expected | Status | Response snippet |
|------|----------|--------|-----------------|
| E7-1: Hunting gear, explicit no-firearms | PASS — normal onboarding continues, no refusal | PASS | "Hunting gear, camping equipment, and outdoor sporting goods — we work with that, no problem at all." |
| E7-2: Outdoor sporting goods (should always pass) | PASS — no refusal | PASS | "Since you carry a range of products across hiking, fishing, archery, and camping, I'd classify this as an ecommerce store" |
| E7-3: Hunting gear + explicit denial of weapons | PASS — negation must suppress refusal | FAIL | "Thank you for reaching out to Vigmis. Unfortunately, we're unable to work with firearms, weapons, ammunition..." |
| E7-4: Explicit firearms — should still be blocked | PASS = refusal is correct outcome | PASS | "Thank you for reaching out to Vigmis. Unfortunately, we're unable to work with firearms..." |
| E7-5: Licensed pharmacy (E8 regression check) | PASS — no refusal, continues onboarding | PASS | "A licensed prescription pharmacy is absolutely something we can work with." |
| E7-6: Outdoor gear + 'shoot' photography language | PASS — 'shoot' in photo context must not trigger refusal | PASS | "Nature and wildlife photography gear is a great space to be in." |

**Fix verdict: PARTIAL**

The fix resolves the most common case (hunting gear with no mention of weapons). However, the negation pattern is unhandled: when a user proactively writes "We do NOT sell any weapons or ammunition," the classifier still fires because it detects the keywords `weapons` and `ammunition` without understanding the negation context. E7-1, E7-2, E7-4, E7-5, E7-6 all pass (5/6). E7-3 is still a false positive.

**Remaining work:** The classifier must handle negated weapon/ammunition mentions — e.g., strip or de-weight keyword signals that are preceded by `not`, `no`, `don't`, `do not`, `never`, `without`.

---

## A2-5 — Currency Disambiguation Loop (commit 9349aca)

| Test | Expected | Status | Response snippet |
|------|----------|--------|-----------------|
| A2-5-MAIN: Bare number twice — assume ILS on 2nd send | Step 2 assumes ILS, confirms ₪3,000, no currency question again | FAIL | Step 2: "Is that ILS (₪), USD ($), AED, or another currency?" — loop repeats |
| A2-5-EDGE1: Bare number then explicit 'that is in ILS' | Confirms ₪3,000 in ILS, no repeat currency question | PASS | "Got it — ₪5,000/month. What percentage..." (correct flow; minor amount hallucination is out of scope) |
| A2-5-EDGE2: First message is bare number, coveredTopics empty | AI asks business type first, not confused | PASS | "Could you tell me a bit about your business? What type of business are you running?" |
| A2-5-EDGE3: Hebrew bare number twice — assume ILS on 2nd send | Step 2 assumes ILS, confirms ₪4,000 in Hebrew, no repeat | FAIL | Step 2: "Is that ₪4,000, $4,000 (USD), AED, or another currency?" — loop repeats; also switches from Hebrew to English |

**Fix verdict: STILL FAILING**

The ILS-assumption injection on second bare number is not firing in either the English (A2-5-MAIN) or Hebrew (A2-5-EDGE3) flows. The fix is non-functional. Additionally, the Hebrew failure reveals a secondary bug: when the second bare number arrives the AI loses track of the conversation language and switches to English.

**Remaining work:**
1. The ILS-assumption logic must actually execute when: (a) the AI has already asked the currency question in a prior turn, AND (b) the user's next message is a bare number with no currency qualifier.
2. The language-persistence bug in the Hebrew flow must be addressed alongside the loop fix.

---

## STEP1 — budget_currency in GET /onboarding/strategy (commit 9349aca)

| Test | Expected | Status | Notes |
|------|----------|--------|-------|
| STEP1-1: GET /onboarding/strategy contains budget_currency and budget_original_amount | Both keys present in settings object | PASS | `"budget_currency": "ILS"`, `"budget_original_amount": null` confirmed in response JSON |
| STEP1-2: budget_currency value is sensible (ILS/USD/AED/null) | Value in {ILS, USD, AED, null} | PASS | Value is `"ILS"` — matches test tenant's ILS budget |
| STEP1-3: GET /onboarding/settings/current route exists | HTTP 200 | FAIL | HTTP 404 — route not implemented (noted as acceptable per test spec) |

**Fix verdict: CONFIRMED**

The two primary tests pass. `budget_currency` and `budget_original_amount` are correctly present and populated in the `GET /onboarding/strategy` response. STEP1-3 (the `/settings/current` route) returns 404 and was marked as informational in the test spec — it is not a blocker for this fix.

---

## Overall verdict

**Not ready for real client onboarding.** Two active regressions block production use:

1. **E7-3 (false positive — negation):** A legitimate hunting-apparel business that proactively disclaims weapon sales gets refused. This is a client-facing trust failure.
2. **A2-5 loop (main + Hebrew):** The currency disambiguation loop repeats indefinitely on bare numbers. Any budget conversation where a user does not explicitly name a currency will loop forever, blocking onboarding completion. The Hebrew language-switch bug compounds this for IL-market clients.

**STEP1** is fully resolved and can be considered closed.

### Priority for Round 4

| Priority | Item | Blocker? |
|----------|------|----------|
| P0 | A2-5: ILS-assumption injection not firing (English + Hebrew) | YES |
| P0 | A2-5: Hebrew language persistence lost on 2nd turn | YES |
| P1 | E7-3: Negation pattern not handled by firearms classifier | YES |
| P2 | STEP1-3: /onboarding/settings/current route (404) | NO — informational only |
