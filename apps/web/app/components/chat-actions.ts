'use server';

import { auth } from '@clerk/nextjs/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function apiCall(path: string, method = 'GET', body?: object) {
  const { getToken } = await auth();
  const token = await getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body
      ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      : { Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type ExecutedAction = {
  type: string;
  campaign_id?: string;
  campaign_name?: string;
  post_id?: string;
  detail?: string;
  success: boolean;
};

export async function sendChatMessage(
  message: string,
  pageContext?: string,
): Promise<{ message: string; executedActions: ExecutedAction[] }> {
  return apiCall('/chat', 'POST', pageContext ? { message, pageContext } : { message });
}

export async function getChatHistory(): Promise<Array<{ id: string; role: string; content: string; created_at: string }>> {
  return apiCall('/chat/history');
}
