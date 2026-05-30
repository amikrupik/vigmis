import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response('Server misconfiguration: CRON_SECRET not set', { status: 500 });

  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

  const res = await fetch(`${apiUrl}/protocols/expire-all`, {
    method: 'POST',
    body: '{}',
    headers: { 'x-cron-secret': cronSecret, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: 'Failed', details: text }, { status: 500 });
  }

  const data = await res.json();
  return Response.json({ ok: true, ...data });
}
