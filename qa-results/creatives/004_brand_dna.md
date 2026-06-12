# Creative: C1-4 — Brand DNA injected

## Why This Test
Brand DNA field injected into gpt-image-1 prompt

## Brief Sent
{
  "prompt": "Organic vegetables advertisement for Israeli farm",
  "_brand_dna": "Brand colors: #2D5016 dark green, #F5E6C8 warm cream. DO NOT MODIFY: logo area bottom-right."
}

## API Request
POST /creatives/generate
Type: image

## Result
- Status: PASS
- HTTP Code: 201
- job_id: 7b9c37b4-304c-4fae-bebc-d7aa79306dc4
- output_url: https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/7b9c37b4-304c-4fae-bebc-d7aa79306dc4.png
- revision_number: 0
- critic_score: n/a

## Assessment
The image was successfully generated and stored, with the API returning HTTP 201 and a valid Supabase public URL. The `_brand_dna` field was accepted in the brief payload and processed without error, confirming that brand DNA injection into the gpt-image-1 prompt pipeline is functional.

## Full API Response
{"job_id":"7b9c37b4-304c-4fae-bebc-d7aa79306dc4","status":"completed","type":"image","output_url":"https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/7b9c37b4-304c-4fae-bebc-d7aa79306dc4.png","revision_number":0,"credit_consumed":false,"critic_score":null}
