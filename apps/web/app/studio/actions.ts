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

export type CreativeJob = {
  id: string;
  type: 'avatar' | 'cinematic' | 'animation' | 'image';
  platform: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'pending_setup' | 'rejected';
  output_url: string | null;
  brief: Record<string, any>;
  campaign_id: string | null;
  created_at: string;
  revision_number: number;
  parent_job_id: string | null;
  approved_at: string | null;
  keep_elements: string[];
  change_request: string | null;
  critic_score: number | null;
  credit_consumed: boolean;
};

export async function getCreativeJobs(): Promise<CreativeJob[]> {
  const result = await apiCall('/creatives');
  return result?.jobs ?? [];
}

export async function generateCreativeJob(params: {
  type: 'avatar' | 'cinematic' | 'animation' | 'image';
  brief: Record<string, any>;
  campaign_id?: string;
  platform?: string;
  parent_job_id?: string;
  keep_elements?: string[];
  change_request?: string;
}): Promise<any> {
  return apiCall('/creatives/generate', 'POST', params);
}

export async function pollCreativeStatus(id: string): Promise<any> {
  return apiCall(`/creatives/${id}/status`);
}

export async function approveCreative(id: string): Promise<any> {
  return apiCall(`/creatives/${id}/approve`, 'POST');
}

export async function rejectCreative(id: string): Promise<any> {
  return apiCall(`/creatives/${id}/reject`, 'POST');
}
