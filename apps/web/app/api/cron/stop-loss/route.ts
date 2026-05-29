import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET ?? 'vigmis-cron';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
  try {
    const res = await fetch(`${apiUrl}/compliance/cron/stop-loss`, {
      method: 'POST',
      headers: { 'x-cron-secret': cronSecret, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return Response.json({ error: 'stop-loss cron failed', details: await res.text() }, { status: 500 });
    return Response.json({ ok: true, ...(await res.json()) });
  } catch (err) {
    return Response.json({ error: 'Failed to reach API', details: String(err) }, { status: 502 });
  }
}
