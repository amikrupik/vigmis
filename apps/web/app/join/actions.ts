'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function acceptInvite(token: string): Promise<{ ok: true } | { error: string }> {
  const { getToken } = await auth();
  const jwt = await getToken();

  const res = await fetch(`${API_URL}/team/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
  });

  const data = await res.json();
  if (!res.ok) return { error: data.error ?? 'Something went wrong' };
  return { ok: true };
}
