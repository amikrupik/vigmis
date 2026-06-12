# Persona G — Micro Budget Yoga Course (150 ILS — Too-Low Test)
## Result: FAIL | 9/9 turns in Hebrew | finalSettings: null | Budget misidentified

### Critical Test Results
| Test | Expected | Result |
|---|---|---|
| 150 ILS flagged as too low | Warning or soft block | FAIL — AI misidentified it as course subscription price |
| Minimum recommended budget mentioned | Yes | FAIL — never mentioned |
| Course price (299 ILS) captured in open_notes | Yes | FAIL — AI asked for gross margin instead |
| Gender targeting (women-focused) captured | exclusions | PARTIAL — verbally acknowledged, not persisted |
| coveredTopics populated | Yes | FAIL — [] throughout |
| finalSettings populated | Yes | FAIL — null after 9 turns |

### Key Findings
- **BUG-013**: 150 ILS budget not flagged — AI treated it as a subscription price for the course, not ad budget
  - Turn 3 AI response: "הבנתי — 150 ₪ לחודש זו עלות המנוי לקורס" (I understand 150 ILS is the course subscription cost)
  - Never corrected this misunderstanding
  - Never warned that 150 ILS/month = ~$40 is insufficient for any meaningful ad campaign
- **BUG-001/002**: finalSettings=null, coveredTopics=[] — tracking broken
- **BUG-003**: Strategy API: 422 for yogawithtal.com (JS-rendered)
- Conversation stalled at gross margin question in turn 9 — never closed
- GAP: women-focused audience acknowledged but not persisted
- DECISION-004 needed: minimum budget enforcement policy

### Strategy Analysis
- yogawithtal.com: JS-rendered, 0 pages → 422 website_unreadable
- All output: null (budget_verdict that should show "too_low" never computed)

### Scores
G=3 S=2 A=2 M=2 H=4 | avg=2.6 | Overall: FAIL

### Sample Turns (Hebrew)
**Turn 3** USER: "150 שקל בחודש" (150 ILS per month)
AI: "הבנתי — 150 ₪ לחודש זו עלות המנוי לקורס 👍 אבל רגע לפני שנמשיך — איך המכירה עובדת?"
→ FAIL: misidentified ad budget as course price; no budget warning

**Turn 9** USER: "הקורס עולה 299 שקל" (The course costs 299 ILS)
AI: "תודה! ומה אחוז הרווח הגולמי שלך על הקורס?" (What is your gross margin %)
→ FAIL: conversation stalled; 299 ILS not captured; loop on margin after 9 turns
