'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

export async function getBrandSettings(): Promise<{
  brand_colors: string[];
  brand_fonts: string[];
  do_not_change_elements: string[];
  approved_creative_styles: any[];
}> {
  const result = await apiCall('/onboarding/status');
  const s = result?.settings ?? {};
  return {
    brand_colors: s.brand_colors ?? [],
    brand_fonts: s.brand_fonts ?? [],
    do_not_change_elements: s.do_not_change_elements ?? [],
    approved_creative_styles: s.approved_creative_styles ?? [],
  };
}

export async function saveBrandSettings(data: {
  brand_colors: string[];
  brand_fonts: string[];
  do_not_change_elements: string[];
}): Promise<{ success: boolean } | { error: string }> {
  try {
    await apiCall('/settings/brand', 'PATCH', data);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Save failed' };
  }
}
