'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function apiCall(path: string, method = 'GET', body?: object) {
  const { getToken } = await auth();
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  return JSON.parse(text);
}

export async function getTeam() {
  return apiCall('/team');
}

export async function inviteMember(email: string) {
  return apiCall('/team/invite', 'POST', { email });
}

export async function revokeInvite(id: string) {
  return apiCall(`/team/invites/${id}`, 'DELETE');
}

export async function removeMember(id: string) {
  return apiCall(`/team/members/${id}`, 'DELETE');
}
