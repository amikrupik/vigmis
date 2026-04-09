'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getDashboardData, launchCampaigns, pauseCampaign, resumeCampaign } from './actions';
import ChatDrawer from './ChatDrawer';
import FeedbackModal from './FeedbackModal';
import { ClerkSignOutButton } from '../components/sign-out-button';

type Campaign = {
  id: string;
  platform: 'google' | 'meta';
  name: string;
  campaign_type: string;
  status: 'pending' | 'active' | 'paused' | 'error';
  daily_budget_usd: number;
  error_message: string | null;
  created_at: string;
};

type DashboardData = {
  onboardingComplete: boolean;
  settings: any;
  connected: { google: boolean; meta: boolean };
  campaigns: Campaign[];
};

const STATUS_COLORS: Record<string, string> = {
  active:  'bg-green-100 text-green-700',
  paused:  'bg-yellow-100 text-yellow-700',
  pending: 'bg-gray-100 text-gray-500',
  error:   'bg-red-100 text-red-700',
};

const PLATFORM_COLORS: Record<string, string> = {
  google: 'text-blue-600',
  meta:   'text-indigo-600',
};

export default function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function load() {
    setLoading(true);
    try {
      const d = await getDashboardData();
      if (!d) { router.push('/sign-in'); return; }
      if (!d.onboardingComplete) { router.push('/onboarding'); return; }
      setData(d);
    } catch {
      setError('שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleLaunch() {
    setLaunching(true);
    setError(null);
    try {
      await launchCampaigns(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה';
      if (msg.includes('creative_required')) {
        setError('קמפיינים ויזואליים דורשים חומרי קריאייטיב. העלה תמונות או רכוש מ-VIGMIS.');
      } else {
        setError(msg);
      }
    } finally {
      setLaunching(false);
    }
  }

  function handleCampaignAction(id: string, action: 'pause' | 'resume') {
    startTransition(async () => {
      try {
        if (action === 'pause') await pauseCampaign(id);
        else await resumeCampaign(id);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'שגיאה');
      }
    });
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const { campaigns, connected, settings } = data;

  // Stats
  const totalDailyBudget = campaigns
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + c.daily_budget_usd, 0);
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused').length;
  const errorCampaigns  = campaigns.filter(c => c.status === 'error').length;

  // Fee estimate
  const monthlyBudgetUsd = settings ? Math.round(settings.budget_monthly_ils / 3.7) : 0;
  const managedBudget = settings
    ? Math.round(monthlyBudgetUsd * (settings.management_percentage ?? 100) / 100)
    : 0;
  const feeEstimate = Math.round(managedBudget * 0.07); // Free tier

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Vigmis" width={110} height={40} priority />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${connected.google ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              Google {connected.google ? '✓' : '✗'}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${connected.meta ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              Meta {connected.meta ? '✓' : '✗'}
            </span>
          </div>
          <a href="/billing" className="text-xs text-gray-400 hover:text-gray-600">Billing</a>
          <a href="/onboarding" className="text-xs text-gray-400 hover:text-gray-600">הגדרות</a>
          <ClerkSignOutButton />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="קמפיינים פעילים" value={String(activeCampaigns)} color="green" />
          <StatCard label="תקציב יומי" value={`$${totalDailyBudget.toFixed(0)}`} color="blue" />
          <StatCard label="תקציב מנוהל/חודש" value={`$${managedBudget}`} color="purple" />
          <StatCard label="עמלה חודשית (Free)" value={`~$${feeEstimate}`} color="gray" />
        </div>

        {/* Launch button — show if no campaigns yet */}
        {campaigns.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">הקמפיינים מוכנים להשקה</h2>
            <p className="text-sm text-gray-500">
              VIGMIS ניתח את האתר שלך ובנה תכנית קמפיין. לחץ Start כדי ליצור את הקמפיינים.
            </p>
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
            >
              {launching ? 'מפעיל...' : '🚀 Start — הפעל קמפיינים'}
            </button>
          </div>
        )}

        {/* Campaigns list */}
        {campaigns.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">קמפיינים</h2>
              <div className="flex gap-2 text-xs text-gray-500">
                <span>{activeCampaigns} פעיל</span>
                <span>·</span>
                <span>{pausedCampaigns} מושהה</span>
                {errorCampaigns > 0 && <><span>·</span><span className="text-red-500">{errorCampaigns} שגיאה</span></>}
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {campaigns.map(campaign => (
                <div key={campaign.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase ${PLATFORM_COLORS[campaign.platform]}`}>
                        {campaign.platform}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">{campaign.name}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-gray-400 capitalize">{campaign.campaign_type}</span>
                      <span className="text-xs text-gray-400">${campaign.daily_budget_usd}/יום</span>
                      {campaign.error_message && (
                        <span className="text-xs text-red-500 truncate">{campaign.error_message}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[campaign.status]}`}>
                      {campaign.status === 'active' ? 'פעיל' :
                       campaign.status === 'paused' ? 'מושהה' :
                       campaign.status === 'pending' ? 'ממתין' : 'שגיאה'}
                    </span>

                    {campaign.status === 'active' && (
                      <button
                        onClick={() => handleCampaignAction(campaign.id, 'pause')}
                        disabled={isPending}
                        className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        השהה
                      </button>
                    )}
                    {campaign.status === 'paused' && (
                      <button
                        onClick={() => handleCampaignAction(campaign.id, 'resume')}
                        disabled={isPending}
                        className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        הפעל
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings summary */}
        {settings && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <h2 className="font-semibold text-gray-900 mb-4">הגדרות קמפיין</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-1">אתר</p>
                <p className="font-medium text-gray-800 truncate">{settings.website_url ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">תקציב חודשי</p>
                <p className="font-medium text-gray-800">₪{settings.budget_monthly_ils?.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">% ניהול</p>
                <p className="font-medium text-gray-800">{settings.management_percentage ?? 100}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">יעד</p>
                <p className="font-medium text-gray-800 capitalize">{settings.goal}</p>
              </div>
            </div>
          </div>
        )}

      </div>

      <ChatDrawer />
      <FeedbackModal />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green:  'bg-green-50  text-green-700',
    blue:   'bg-blue-50   text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    gray:   'bg-gray-50   text-gray-700',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]?.split(' ')[1]}`}>{value}</p>
    </div>
  );
}
