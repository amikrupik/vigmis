# Vigmis QA Round 4 — Final Regression Report
## Date: 2026-06-12
## Commit: 52a50c8

## Overall: REMAINING BLOCKERS

---

## E7-3 — Negation Pattern Fix

| Test | Expected | Status | Response snippet |
|------|----------|--------|-----------------|
| E7-3 Hunting clothing store with explicit weapons disclaimer | Onboarding continues normally; negation regex bypasses firearms block | PASS | "Great, welcome to Vigmis! Hunting apparel, boots, and navigation gear — sounds like a solid outdoor/sporting goods store." |
| E7-4 Explicit firearms/gun shop — must still be blocked | Blocked with blocked:true and blockedCategory:firearms | PASS | "Thank you for reaching out to Vigmis. Unfortunately, we're unable to work with firearms, weapons, ammunition, or related businesses..." |

**Verdict: CONFIRMED** — Negation regex correctly distinguishes "do not sell weapons" (allow) from an actual gun shop (block). No regression introduced.

---

## A2-5 — Currency Loop Fix

| Test | Expected | Status | Response snippet |
|------|----------|--------|-----------------|
| A2-5a Currency disambiguation — step 1: bare English number triggers currency question | AI asks "Is that ILS, USD, or AED?" on first bare number | FAIL | "Got it — $3,000/month." — assumed USD without asking |
| A2-5b Currency disambiguation — step 2: follow-up bare number resolves to ILS without re-asking | After step 1 asks currency, second bare number confirms a specific currency | FAIL | "Just to confirm: is that in ILS (₪), USD ($), AED, or another currency?" — currency question repeated instead of resolved |
| A2-5c Currency disambiguation — Hebrew flow: bare number twice stays Hebrew and assumes ILS | Step 1 asks currency in Hebrew; step 2 assumes ILS without re-asking | PASS | Step 3a asked in Hebrew; step 3b assumed ILS with ₪/שקל present and no repeat question |

**Verdict: STILL FAILING** — English-language currency disambiguation is broken in two ways: (1) bare numbers in English are assumed to be USD without asking, and (2) when the question is eventually asked, the loop resets on the next turn instead of resolving. Hebrew path works correctly.

---

## Production Readiness Assessment

Blocking bugs remain unresolved. A2-5 (English currency disambiguation) fails steps a and b:

- **A2-5a**: System must ask for currency clarification on first bare English number instead of assuming USD.
- **A2-5b**: Once currency disambiguation is triggered, the second bare number must resolve to a confirmed currency — not re-ask.

Remaining work before limited beta:

1. Fix English-language onboarding prompt to require currency clarification when a bare number is entered (no currency symbol, no word like "dollars" or "shekels").
2. Fix conversation state so that once a currency question has been asked, the next user input resolves the ambiguity and does not re-trigger the question.
3. Re-run A2-5a and A2-5b after fix; confirm Hebrew path (A2-5c) has not regressed.

Non-blocking issues carried forward (from QA Rounds 2-3): P0-1 timeout handling, B4 first_30_days field, E4/E5 blocked field not returned on non-blocked responses, R3 idempotency on duplicate webhook delivery.

**Not ready for limited beta until A2-5a and A2-5b are resolved.**
