'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function apiCall(path: string, method = 'GET', body?: object) {
  const { getToken } = await auth();
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getBillingStatus() {
  return apiCall('/billing/status');
}

export async function startCheckout(): Promise<{ url: string }> {
  return apiCall('/billing/checkout', 'POST');
}

export async function openPortal(): Promise<{ url: string }> {
  return apiCall('/billing/portal', 'POST');
}
