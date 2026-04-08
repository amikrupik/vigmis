import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import OnboardingPageClient from './OnboardingPageClient';

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-100 px-6 py-4">
        <span className="font-semibold text-gray-900">Vigmis</span>
        <span className="ml-2 text-sm text-gray-400">הגדרת חשבון</span>
      </header>
      <main className="flex-1 flex flex-col">
        <OnboardingPageClient />
      </main>
    </div>
  );
}
