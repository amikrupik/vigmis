import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import BrandSettingsClient from './BrandSettingsClient';
import { getBrandSettings } from './actions';

export const metadata: Metadata = { title: 'Brand DNA — Vigmis' };

export default async function BrandSettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  let settings = {
    brand_colors: [] as string[],
    brand_fonts: [] as string[],
    do_not_change_elements: [] as string[],
    approved_creative_styles: [] as any[],
  };

  try {
    settings = await getBrandSettings();
  } catch {
    // proceed with defaults
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Brand DNA</h1>
          <p className="text-sm text-slate-500 mt-1">
            Define your brand identity. These settings are automatically injected into every AI creative generation.
          </p>
        </div>
        <BrandSettingsClient
          initialColors={settings.brand_colors}
          initialFonts={settings.brand_fonts}
          initialDoNotChange={settings.do_not_change_elements}
        />
        <p className="text-xs text-slate-400 mt-8">
          <a href="/settings/general" className="hover:text-slate-600">General Settings</a>
          {' '}·{' '}
          <a href="/dashboard" className="hover:text-slate-600">Back to dashboard</a>
        </p>
      </div>
    </div>
  );
}
