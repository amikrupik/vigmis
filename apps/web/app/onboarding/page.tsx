import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import OnboardingPageClient from './OnboardingPageClient';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; rethink?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const params = await searchParams;

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
