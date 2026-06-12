# Creative: C1-5 — Short brief

## Why This Test
Minimum viable brief — tests short input handling

## Brief Sent
{
  "prompt": "Israeli organic farm, fresh today, buy direct from farmer"
}

## API Request
POST /creatives/generate
Type: image

## Result
- Status: PASS
- HTTP Code: 201
- job_id: fa658f07-990e-4ff3-b2c3-04248a8b84e9
- output_url: https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/fa658f07-990e-4ff3-b2c3-04248a8b84e9.png
- revision_number: 0
- critic_score: n/a

## Assessment
The API successfully generated an image from a minimal 9-word prompt, returning a completed job with a valid Supabase storage URL. Short input handling works correctly — no validation errors or fallbacks triggered, and the response structure is fully intact.

## Full API Response
{"job_id":"fa658f07-990e-4ff3-b2c3-04248a8b84e9","status":"completed","type":"image","output_url":"https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/fa658f07-990e-4ff3-b2c3-04248a8b84e9.png","revision_number":0,"credit_consumed":false,"critic_score":null}
