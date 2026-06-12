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

export type ExecutedAction = {
  type: string;
  campaign_id?: string;
  campaign_name?: string;
  detail?: string;
  success: boolean;
};

export async function sendChatMessage(message: string): Promise<{ message: string; executedActions: ExecutedAction[] }> {
  return apiCall('/chat', 'POST', { message });
}

export async function getChatHistory(): Promise<Array<{ id: string; role: string; content: string; created_at: string }>> {
  return apiCall('/chat/history');
}

export async function getPendingFeedback(): Promise<{ trigger: string; question: string } | null> {
  return apiCall('/feedback/pending');
}

export async function submitFeedback(trigger: string, rating: number, comment?: string, followup?: string): Promise<void> {
  await apiCall('/feedback/submit', 'POST', { trigger, rating, comment, followup });
}
