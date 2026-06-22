import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response('Server misconfiguration: CRON_SECRET not set', { status: 500 });

  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiUrl = process.env.API_URL ?? 'http://localhost:8080';
  const start = Date.now();
  console.log('[cron/geo-refresh] Starting monthly GEO refresh for all tenants');

  let res: Response;
  try {
    res = await fetch(`${apiUrl}/geo/refresh-all`, {
      method: 'POST',
      body: '{}',
      headers: { 'x-cron-secret': cronSecret, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron/geo-refresh] Fetch failed:', err);
    return Response.json({ error: 'Failed to reach API', details: String(err) }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text();
    console.error('[cron/geo-refresh] API returned', res.status, text);
    return Response.json({ error: 'GEO refresh failed', details: text }, { status: 500 });
  }

  const data = await res.json();
  console.log('[cron/geo-refresh] Done in', Date.now() - start, 'ms', data);
  return Response.json({ ok: true, ...data });
}
