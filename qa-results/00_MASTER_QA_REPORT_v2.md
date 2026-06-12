# Vigmis QA Report v2 — June 11, 2026
## 31 agents | 30 scenarios | 845K tokens | Production API

### VERDICT: NOT YET — 3 P0 blockers + 7 P1 issues

## SCORES
- Content Policy: 10/10 PASS ✅
- Chat AI Brain: 4/4 PASS ✅  
- Onboarding: 0/8 PASS (6 PARTIAL, 1 FAIL, 1 blocking loop)
- Strategy: 0/4 PASS (3 PARTIAL — quality good but 4-minute timeout kills prod)
- Creative initial: 3/3 generated successfully ✅
- Creative revision: 0/3 PASS (rate limit + brief corruption)

## CREATIVE IMAGE URLs PRODUCED
- https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/c142bcaf-50b3-4282-8710-78fad3f72612.png
- https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/270f693a-56ff-4d41-8368-a310e017a125.png  
- https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/6a4f4b65-7905-41ca-bc12-65cee4877a7b.png

## P0 BLOCKERS
1. /onboarding/analyze hangs 3.5-4.5 min → 504 timeout for all real clients
2. AI hallucination writes invented facts into client settings (wedding collection never mentioned)
3. revision_number increments on failure → billing fires on undelivered creative

## P1 (7 issues)
1. Creative retry no backoff — burns rate limit instantly
2. brief field stored as char-indexed object (not string) — corrupts all revisions
3. USD/AED budget loses source currency — no budget_currency field
4. Arabic fails turns 1-2, reverts on turns 5+8 in multi-turn conversations
5. Currency ambiguity blocks conversation completion indefinitely
6. OpenAI org ID leaks in error responses
7. /connectors/meta/adaccounts returns 404

## WHAT'S READY TODAY
- Content policy: production-ready
- Chat AI Brain: production-ready
- Initial image generation: working
- Strategy quality (when it completes): strong, client-facing

## FULL TRANSCRIPT
See wr10leica.output for full persona transcripts, strategy excerpts, and bug details.
