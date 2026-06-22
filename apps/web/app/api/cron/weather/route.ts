import { NextRequest } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response('Server misconfiguration: CRON_SECRET not set', { status: 500 });
  if (authHeader !== `Bearer ${cronSecret}`) return new Response('Unauthorized', { status: 401 });
  const apiUrl = process.env.API_URL ?? 'http://localhost:8080';
  try {
    const res = await fetch(`${apiUrl}/ops/cron/weather`, {
      method: 'POST',
      body: '{}',
      headers: { 'x-cron-secret': cronSecret, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return Response.json({ error: 'weather refresh failed', details: await res.text() }, { status: 500 });
    return Response.json({ ok: true, ...(await res.json()) });
  } catch (err) {
    return Response.json({ error: 'Failed to reach API', details: String(err) }, { status: 502 });
  }
}
