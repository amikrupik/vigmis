import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import DashboardClient from './DashboardClient';

export const metadata = { title: 'Dashboard — Vigmis' };
export const maxDuration = 300;

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return <DashboardClient />;
}
