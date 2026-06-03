import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import GeneralSettingsClient from './GeneralSettingsClient';
import { getSettings } from './actions';

export const metadata: Metadata = { title: 'General Settings — Vigmis' };

export default async function GeneralSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  let settings: { logo_url?: string | null; website_url?: string | null } | null = null;
  try {
    const result = await getSettings();
    settings = result?.settings ?? null;
  } catch {
    // proceed with no initial settings
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">General Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your brand assets and preferences.</p>
        </div>
        <GeneralSettingsClient
          initialLogoUrl={settings?.logo_url ?? null}
          websiteUrl={settings?.website_url ?? null}
        />
        <p className="text-xs text-slate-400 mt-8">
          ← <a href="/dashboard" className="hover:text-slate-600">Back to dashboard</a>
        </p>
      </div>
    </div>
  );
}
