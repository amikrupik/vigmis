# Creative: C1-1 — Hebrew Organic Farm basic

## Why This Test
Basic Hebrew brief — gpt-image-1 from Hebrew prompt, best-of-3

## Brief Sent
{
  "prompt": "מוצרים אורגניים טריים מהארץ הטובה — ירקות, פירות, מוצרי חלב. אורות חמים, רקע חוות ירוקה"
}

## API Request
POST /creatives/generate
Type: image

## Result
- Status: PASS
- HTTP Code: 201
- job_id: 79f141ec-dfd1-4acc-8bd3-4fdda05781cf
- output_url: https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/79f141ec-dfd1-4acc-8bd3-4fdda05781cf.png
- revision_number: 0
- critic_score: n/a

## Assessment
The API successfully generated an image from a Hebrew-language brief, returning HTTP 201 with a valid Supabase Storage output_url. Hebrew prompt handling via Unicode-escaped JSON worked correctly; the job completed synchronously with status "completed" and no credit was consumed (test token).

## Full API Response
{"job_id":"79f141ec-dfd1-4acc-8bd3-4fdda05781cf","status":"completed","type":"image","output_url":"https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/79f141ec-dfd1-4acc-8bd3-4fdda05781cf.png","revision_number":0,"credit_consumed":false,"critic_score":null}
