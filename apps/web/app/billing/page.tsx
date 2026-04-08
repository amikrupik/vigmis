import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import BillingClient from './BillingClient';

export const metadata = { title: 'Billing — Vigmis' };

export default async function BillingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  return <BillingClient />;
}
