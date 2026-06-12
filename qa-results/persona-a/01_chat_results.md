# Persona A — Studio Noya (Israeli Women's Fashion, e-commerce)
## Result: 13/13 turns in Hebrew, all topics covered

### Critical Test Results
| Test | Expected | Result |
|---|---|---|
| Currency ask on bare "2000" | Asks ILS/USD | ✅ PASS |
| 37% management accepted | Yes | ✅ PASS |
| Margin asked (goal=purchases) | Yes | ✅ PASS |
| Hebrew throughout | Yes | ✅ 13/13 |
| budget_monthly_ils | 7400 ($2000×3.7) | ✅ PASS |

### Findings
- **F5 NOTE**: [SUMMARY] tag not in message body — structured data in `settings` field. OK by design.
- **I3 MINOR**: Platform question asked after open_notes (not in 10-topic spec) — caused slight loop
- **I5 NOTE**: geo_include stored in English despite Hebrew conversation ("Israel", "Jewish communities in US")

### Scores (avg across 13 turns)
G=3.8 S=4.5 A=4.3 M=4.3 H=5.0

### Settings JSON Collected
```json
{
  "business_type": "ecommerce",
  "website_url": "https://www.goodland.co.il",
  "budget_monthly_ils": 7400,
  "management_percentage": 37,
  "goal": "purchases",
  "margin_pct": 60,
  "geo_include": ["Israel", "Jewish communities in the United States"],
  "geo_exclude": [],
  "exclusions": "Never use sexual content or revealing images. Brand is modest/tzniut.",
  "open_notes": "Pause all ads on Jewish holidays. Business name: Studio Noya. 200 products.",
  "preferred_platforms": null
}
```
