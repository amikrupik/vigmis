import Image from 'next/image';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';
import { ClerkSignOutButton } from '../components/sign-out-button';

export const metadata = { title: 'Dashboard — Vigmis' };

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
        <Image src="/logo.png" alt="Vigmis" width={110} height={40} priority />
        <ClerkSignOutButton />
      </header>
      <main className="flex-1">
        <DashboardClient />
      </main>
    </div>
  );
}
