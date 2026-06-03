import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import TeamClient from './TeamClient';
import { getTeam } from './actions';

export const metadata: Metadata = { title: 'Team — Vigmis' };

export default async function TeamPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  let team;
  try {
    team = await getTeam();
  } catch {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Team members</h1>
          <p className="text-sm text-slate-500 mt-1">
            Invite colleagues to access your Vigmis workspace. Scale plan allows up to 3 users.
          </p>
        </div>
        <TeamClient initial={team} />
        <p className="text-xs text-slate-400 mt-8">
          ← <a href="/dashboard" className="hover:text-slate-600">Back to dashboard</a>
        </p>
      </div>
    </div>
  );
}
