# Creative Gallery — QA Round 2
## Date: 2026-06-12
## Base Job ID: 79f141ec-dfd1-4acc-8bd3-4fdda05781cf

---

| # | ID | Scenario | Why | Status | Output URL | Critic Score |
|---|----|----------|-----|--------|------------|--------------|
| 1 | C1-1 | Hebrew organic farm brief | Validates non-Latin (Hebrew) input through gpt-image-1 pipeline | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/79f141ec-dfd1-4acc-8bd3-4fdda05781cf.png) | 0 |
| 2 | C1-2 | English organic farm brief | Baseline English brief end-to-end | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/2717c2c0-f34d-4c51-bf25-b77c637d8f7f.png) | 0 |
| 3 | C1-3 | Style hint: minimalist | Validates style field injection into prompt | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/07a258fe-ed3d-4ed5-b738-4e01f80602ee.png) | 0 |
| 4 | C1-4 | Brand DNA injected | Validates _brand_dna field accepted and passed to prompt | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/7b9c37b4-304c-4fae-bebc-d7aa79306dc4.png) | 0 |
| 5 | C1-5 | Short brief (9 words) | Validates minimal input does not fail validation | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/fa658f07-990e-4ff3-b2c3-04248a8b84e9.png) | 0 |
| 6 | C1-6 | Arabic brief — UAE market | Validates RTL/Arabic script through pipeline without encoding error | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/eb568524-55dc-4698-a356-dc3b5e3dab96.png) | 0 |
| 7 | REV-R1 | Revision 1 (free tier) | First revision; validates revision pipeline initiates correctly | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/42555e4f-f5f5-40a2-9e79-9c9f71f91301.png) | — |
| 8 | REV-R2 | Revision 2 (free, keep_elements=['color palette']) | Validates keep_elements stored and revision counter increments | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/a6a4eb62-3479-44d6-afa1-414f2df0cb93.png) | — |
| 9 | REV-R3 | Revision 3 (50% charge tier) — slot consumed by R2 duplicate | Client timeout on R2 caused retry; R3 slot consumed by identical R2 payload | PARTIAL | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/0f92ba6a-0643-4b79-9c19-359492f5281d.png) | — |
| 10 | REV-R4 | Revision 4 (change_request: outdoor market scene) | Validates change_request field accepted at revision 4 | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/e4228045-703f-4cca-9de6-9ec6e3471ecf.png) | — |
| 11 | REV-R5 | Revision 5 (final allowed slot) | Validates 5th revision completes; client timed out but server succeeded | PASS | [View](https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/a7ee70cb-28ef-47bd-8e2f-3dfe3f7e8a43.png) | — |

---

## Notes

- Critic score 0 = no quality issues flagged. Low scores are expected on well-formed briefs.
- Revision rows R1-R5 all share the same base creative (job_id 79f141ec). Each output_url is a separate generation.
- REV-R3 is PARTIAL: client-side timeout on R2 caused a duplicate request that consumed the R3 slot before a distinct R3 payload could be submitted. The revision limit gate (R6) blocked correctly at rev=6.
- All creatives generated via gpt-image-1 (not DALL-E 3).
- Storage bucket: `creatives`, tenant: `7822c548-ecea-4572-929b-bcee1b4b3db2`.
