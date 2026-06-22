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

export async function getSettings() {
  return apiCall('/onboarding/status');
}

export async function uploadLogo(formData: FormData): Promise<{ url: string } | { error: string }> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return { error: 'Not authenticated' };

  const file = formData.get('file');
  if (!(file instanceof Blob)) return { error: 'No file provided' };
  if (file.size > 2 * 1024 * 1024) return { error: 'File too large — maximum 2 MB' };

  // Send to API which handles Supabase Storage
  const uploadForm = new FormData();
  uploadForm.append('file', file);

  const res = await fetch(`${API_URL}/settings/logo/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: uploadForm,
  });

  const text = await res.text();
  if (!res.ok) return { error: text };
  const data = JSON.parse(text) as { url: string };
  return { url: data.url };
}

export async function saveLogo(url: string): Promise<{ success: boolean } | { error: string }> {
  try {
    await apiCall('/settings/logo', 'PUT', { logo_url: url });
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Save failed' };
  }
}
