# Creative: C1-2 — English Organic Farm basic

## Why This Test
Basic English brief

## Brief Sent
{
  "prompt": "Fresh organic vegetables and dairy from The Good Land farm. Clean lifestyle photography, bright natural light"
}

## API Request
POST /creatives/generate
Type: image

## Result
- Status: PASS
- HTTP Code: 201
- job_id: 2717c2c0-f34d-4c51-bf25-b77c637d8f7f
- output_url: https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/2717c2c0-f34d-4c51-bf25-b77c637d8f7f.png
- revision_number: 0
- critic_score: n/a

## Assessment
The image was generated successfully and stored at a public Supabase URL, confirming the pipeline handled a plain English brief end-to-end. The response shows status "completed" with revision_number 0 and no credit consumed, consistent with a first-generation creative on a test account.

## Full API Response
{"job_id":"2717c2c0-f34d-4c51-bf25-b77c637d8f7f","status":"completed","type":"image","output_url":"https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/2717c2c0-f34d-4c51-bf25-b77c637d8f7f.png","revision_number":0,"credit_consumed":false,"critic_score":null}
