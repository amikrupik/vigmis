import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import OnboardingPageClient from './OnboardingPageClient';

export const maxDuration = 300;

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; rethink?: string }>;
}) {
  const { userId, getToken } = await auth();
  if (!userId) redirect('/sign-in');

  const params = await searchParams;

  // Redirect already-onboarded users to the dashboard unless they explicitly
  // want to rethink their strategy (?rethink=true).
  if (params.rethink !== 'true') {
    try {
      const token = await getToken();
      if (token) {
        const res = await fetch(`${API_URL}/onboarding/status`, {
          headers: { Authorization: `Bearer ${token}` },
          next: { revalidate: 0 },
        });
        if (res.ok) {
          const status = await res.json();
          if (status?.confirmed_at) {
            redirect('/dashboard');
          }
        }
      }
    } catch {
      // Non-fatal — if the status check fails, let the user proceed to onboarding
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OnboardingPageClient
        initialConnected={params.connected}
        initialError={params.error}
        rethinkMode={params.rethink === 'true'}
      />
    </div>
  );
}
