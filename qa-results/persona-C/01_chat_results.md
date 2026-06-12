# Persona C — Dr. Levin Dental (Tel Aviv Local Services)
## Chat: PARTIAL | Strategy: FAIL (website_unreadable) | All turns in Hebrew

### Critical Test Results
| Test | Expected | Result |
|---|---|---|
| 1100 ILS accepted without asking currency | Yes | PASS — ₪1,100 confirmed directly |
| No margin asked (lead_gen goal) | Skip margin | PASS |
| Hebrew throughout | Yes | PASS — 8/8 turns in Hebrew |
| geo_include = local (TLV + Ramat Gan) | Yes | PASS |
| Shabbat/holiday exclusion captured | open_notes or exclusions | PARTIAL — verbally acknowledged, finalSettings=null |
| coveredTopics populated | Yes | FAIL — [] throughout |
| finalSettings populated | Yes | FAIL — null after 8 turns |

### Strategy Analysis
- Website levin-dental.co.il: JS-rendered/bot-blocking — scraper got 0 pages
- Result: HTTP 422 website_unreadable — zero output
- open_notes with business context: IGNORED (no fallback)
- Budget analysis: null | Platforms: [] | Creative briefs: []
- This failure blocks 100% of Israeli SMB clients on Wix

### Key Findings
- **BUG-003**: Strategy API hard-fails on unscrapable sites, ignores open_notes
- **BUG-001/002**: finalSettings=null, coveredTopics=[] — tracking broken
- Conversational layer was strong: fluent Hebrew, logical sequence
- Shabbat+Yom Kippur exclusion verbally acknowledged but not persisted
- Hours (Sun-Thu 9-18) acknowledged but not persisted
- DECISION-002 required: how to handle unscrapable sites

### Scores (Chat)
G=2 S=3 A=3 M=4 H=5 | avg=3.4
Strategy: G=0 S=0 A=0 M=0 H=0 (hard error)

### Sample Turns (Hebrew)
**Turn 3** USER: "אני רוצה להשקיע 1100 שקל בחודש"
AI: "מעולה! ... התקציב: **₪1,100 לחודש** ✅"
→ PASS: no currency question (user said שקל)

**Turn 7** USER: "לא לטרגט קהל מתחת לגיל 18. לא לפרסם בשבת וביום כיפור"
AI: "מצוין! ✅ לא לטרגט מתחת לגיל 18, ולא לפרסם בשבת וביום כיפור."
→ PARTIAL: acknowledged but not persisted (finalSettings=null)
