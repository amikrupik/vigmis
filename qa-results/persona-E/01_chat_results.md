# Persona E — New Business, No Website (Gardening Equipment)
## Result: FAIL | 9/9 turns in Hebrew | finalSettings: null | LOOP STUCK

### Critical Test Results
| Test | Expected | Result |
|---|---|---|
| No website handled gracefully | Ask for description or continue | PARTIAL — acknowledged but caused business-type loop |
| 500 ILS budget flagged as too low | Warning | FAIL — budget never flagged; misinterpreted as course price |
| Margin asked (ecommerce + purchases) | Yes | FAIL — never asked despite sales goal |
| Exclusions (danger to children) captured | exclusions field | PARTIAL — verbally acknowledged in turn 8, not persisted |
| Business type disambiguation | Resolve in 1-2 turns | FAIL — loop ran turns 3–9 (6 consecutive repetitions) |
| coveredTopics populated | Yes | FAIL — [] throughout |
| finalSettings populated | Yes | FAIL — null after 9 turns |

### Key Findings
- **BUG-011**: Business model disambiguation loop — AI asked same question 6 consecutive turns
  - Turn 3: AI ignored "500 שקל" budget answer, kept asking business type
  - Turn 4: AI ignored "100%" management answer, kept asking
  - Turn 5: AI finally moved on when user said "מכירות" (purchases/sales)
  - But then loop re-started after turn 6 (margin answer "40%")
  - Turns 7, 8, 9: AI kept returning to "how will customers buy from you?" 
- **BUG-003**: Strategy API: 422 website_unreadable with empty website_url — no fallback
- **GAP-04**: Margin never asked despite ecommerce + purchases goal
- **GAP-07**: Pre-launch user has no strategy path — API requires working URL
- 500 ILS budget: not flagged as too low at any point (BUG-013)

### Strategy Analysis
- website_url = "" → API returned 422 website_unreadable
- open_notes contained: "Organic gardening equipment, eco-friendly. New business, no website yet."
- This context was ignored — no fallback strategy generated
- All fields null: budget_verdict, platforms, creative_briefs

### Scores
G=5 S=2 A=2 M=4 H=4 | avg=3.4
Note: G=5 because no-website was handled conversationally; flow failed in backend

### Sample Turns (Hebrew)
**Turn 3** USER: "500 שקל לחודש"
AI: "תודה! אבל לפני שנדבר על תקציב, חשוב לי להבין את סוג העסק... האם תהיה זו: חנות אונליין / מוצר מוביל / חנות פיזית?"
→ FAIL: ignored budget answer; business type loop continued

**Turn 8** USER: "לא לפרסם ציוד שמסוכן לילדים ללא אזהרה ברורה"
AI: "תודה, רשמתי! אבל אני עדיין חייב להבין — איך הלקוחות שלך יקנו ממך?"
→ FAIL: even after content restriction, loop continued
