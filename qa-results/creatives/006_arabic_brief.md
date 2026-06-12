# Creative: C1-6 — Arabic brief UAE market

## Why This Test
Arabic script in image prompt — non-Latin character handling

## Brief Sent
{
  "prompt": "منتجات عضوية طازجة من مزرعة إسرائيلية — خضروات وفواكه وألبان. صور احترافية، إضاءة طبيعية"
}

## API Request
POST /creatives/generate
Type: image

## Result
- Status: PASS
- HTTP Code: 201
- job_id: eb568524-55dc-4698-a356-dc3b5e3dab96
- output_url: https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/eb568524-55dc-4698-a356-dc3b5e3dab96.png
- revision_number: 0
- critic_score: n/a

## Assessment
The API correctly parsed and processed the Arabic-script brief without any character encoding errors, returning a completed image generation with a valid Supabase storage URL. Non-Latin (RTL Arabic) input passed end-to-end through the generation pipeline with HTTP 201 and a usable output_url.

## Full API Response
{"job_id":"eb568524-55dc-4698-a356-dc3b5e3dab96","status":"completed","type":"image","output_url":"https://rzgkyzjetnrpcqmzfjtv.supabase.co/storage/v1/object/public/creatives/7822c548-ecea-4572-929b-bcee1b4b3db2/eb568524-55dc-4698-a356-dc3b5e3dab96.png","revision_number":0,"credit_consumed":false,"critic_score":null}
