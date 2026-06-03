import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import JoinClient from './JoinClient';

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) redirect('/');

  const { userId } = await auth();
  if (!userId) {
    // Not logged in — send to sign-up, then return here
    redirect(`/sign-up?redirect_url=/join?token=${encodeURIComponent(token)}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <JoinClient token={token} />
    </div>
  );
}
