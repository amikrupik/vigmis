import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import StudioClient from './StudioClient';

export const metadata: Metadata = { title: 'Creative Studio — Vigmis' };

export default async function StudioPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <StudioClient />
    </Suspense>
  );
}
