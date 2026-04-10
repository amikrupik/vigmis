'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  getDashboardData, launchCampaigns, pauseCampaign, resumeCampaign,
  getAnalytics, generateAdCopy, scoreCreative, discoverAudiences,
  getTerritoryIntel, getCompetitors, getBudgetPacing, getAlerts, dismissAlert,
  generateCreative, getCreatives, getCreativeStatus,
} from './actions';
import ChatDrawer from './ChatDrawer';
import FeedbackModal from './FeedbackModal';
import { ClerkSignOutButton } from '../components/sign-out-button';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'analytics' | 'campaigns' | 'creative' | 'intelligence' | 'settings';

type Campaign = {
  id: string; platform: 'google' | 'meta' | 'tiktok';
  name: string; campaign_type: string;
  status: 'pending' | 'active' | 'paused' | 'error';
  daily_budget_usd: number; error_message: string | null;
};

type DashboardData = {
  onboardingComplete: boolean; settings: any;
  connected: { google: boolean; meta: boolean; tiktok?: boolean };
  campaigns: Campaign[];
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', paused: 'bg-amber-100 text-amber-700',
  pending: 'bg-slate-100 text-slate-500', error: 'bg-red-100 text-red-700',
};
const PLATFORM_BADGE: Record<string, string> = {
  google: 'text-blue-600 bg-blue-50', meta: 'text-violet-600 bg-violet-50', tiktok: 'text-slate-700 bg-slate-100',
};

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
  { key: 'analytics', label: 'Analytics', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
  { key: 'campaigns', label: 'Campaigns', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
  { key: 'creative', label: 'Creative', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg> },
  { key: 'intelligence', label: 'Intelligence', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
  { key: 'settings', label: 'Settings', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
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
    } catch { setError('Failed to load dashboard'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleLaunch() {
    setLaunching(true); setError(null);
    try { await launchCampaigns(true); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Launch failed'); }
    finally { setLaunching(false); }
  }

  function handleCampaignAction(id: string, action: 'pause' | 'resume') {
    startTransition(async () => {
      try {
        if (action === 'pause') await pauseCampaign(id); else await resumeCampaign(id);
        await load();
      } catch (err) { setError(err instanceof Error ? err.message : 'Action failed'); }
    });
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return null;

  const { campaigns, connected, settings } = data;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused').length;
  const errorCampaigns  = campaigns.filter(c => c.status === 'error').length;
  const totalDailyBudget = campaigns.filter(c => c.status === 'active').reduce((s, c) => s + c.daily_budget_usd, 0);
  const managedBudget = settings ? Math.round((settings.budget_monthly_ils / 3.7) * ((settings.management_percentage ?? 100) / 100)) : 0;
  const feeEstimate = Math.round(managedBudget * 0.07);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <Image src="/logo.png" alt="Vigmis" width={90} height={32} priority />
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <PlatformBadge name="Google" connected={connected.google} />
              <PlatformBadge name="Meta" connected={connected.meta} />
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-400 font-medium">TikTok — soon</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <a href="/billing" className="text-slate-500 hover:text-slate-800 font-medium transition-colors">Billing</a>
              <ClerkSignOutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Tab nav */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="max-w-6xl mx-auto flex gap-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

        {tab === 'overview' && (
          <OverviewTab
            campaigns={campaigns} settings={settings}
            activeCampaigns={activeCampaigns} pausedCampaigns={pausedCampaigns}
            errorCampaigns={errorCampaigns} totalDailyBudget={totalDailyBudget}
            managedBudget={managedBudget} feeEstimate={feeEstimate}
            onViewAll={() => setTab('campaigns')}
            launching={launching} onLaunch={handleLaunch}
          />
        )}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'campaigns' && (
          <CampaignsTab
            campaigns={campaigns} isPending={isPending}
            onAction={handleCampaignAction}
            activeCampaigns={activeCampaigns} pausedCampaigns={pausedCampaigns} errorCampaigns={errorCampaigns}
          />
        )}
        {tab === 'creative' && <CreativeTab settings={settings} />}
        {tab === 'intelligence' && <IntelligenceTab settings={settings} connected={connected} />}
        {tab === 'settings' && <SettingsTab settings={settings} connected={connected} />}
      </div>

      <ChatDrawer />
      <FeedbackModal />
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ campaigns, settings, activeCampaigns, pausedCampaigns, errorCampaigns, totalDailyBudget, managedBudget, feeEstimate, launching, onLaunch, onViewAll }: any) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [pacing, setPacing] = useState<any>(null);

  useEffect(() => {
    getAlerts().then(r => setAlerts(r?.alerts ?? []));
    getBudgetPacing().then(setPacing);
  }, []);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Campaigns" value={String(activeCampaigns)} sub={pausedCampaigns ? `${pausedCampaigns} paused` : undefined} color="green" />
        <StatCard label="Daily Budget" value={`$${totalDailyBudget.toFixed(0)}`} sub="active spend" color="blue" />
        <StatCard label="Managed / Month" value={`$${managedBudget}`} sub="of ad budget" color="purple" />
        <StatCard label="Monthly Fee" value={`~$${feeEstimate}`} sub="Free tier (7%)" color="gray" />
      </div>

      {/* Active Alerts */}
      {alerts.filter(a => !a.dismissed).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Active Alerts</p>
          {alerts.filter(a => !a.dismissed).map((alert: any) => (
            <AlertCard key={alert.id} alert={alert} onDismiss={async () => {
              await dismissAlert(alert.id);
              setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, dismissed: true } : a));
            }} />
          ))}
        </div>
      )}

      {/* Budget Pacing */}
      {pacing && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-800">Budget Pacing — Day {pacing.day_of_month} of {pacing.days_in_month}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              pacing.status === 'on_track' ? 'bg-emerald-100 text-emerald-700' :
              pacing.status === 'overspending' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>{pacing.status === 'on_track' ? 'On Track' : pacing.status === 'overspending' ? 'Overspending' : 'Underspending'}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full mb-2">
            <div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, pacing.month_progress_pct)}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-400 mb-3">
            <span>${pacing.actual_spend_to_date} spent</span>
            <span>${pacing.expected_monthly_usd} total budget</span>
          </div>
          <p className="text-xs text-slate-500">{pacing.recommendation}</p>
          {pacing.is_mock && <p className="text-xs text-slate-400 mt-2 italic">* Connect Google + Meta to see real spend data</p>}
        </div>
      )}

      {/* Launch */}
      {campaigns.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5 shadow-sm">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Campaigns ready to launch</h2>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">Vigmis analyzed your site and built a campaign plan. Click Launch to create your campaigns on Google, Meta, and TikTok.</p>
          </div>
          <button onClick={onLaunch} disabled={launching} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-xl transition-colors shadow-sm">
            {launching ? 'Launching...' : 'Launch Campaigns →'}
          </button>
        </div>
      )}

      {/* Recent campaigns (mini) */}
      {campaigns.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">Campaigns</h2>
            <button onClick={onViewAll} className="text-xs text-indigo-600 font-medium">View all →</button>
          </div>
          <div className="divide-y divide-slate-50">
            {campaigns.slice(0, 4).map((c: Campaign) => (
              <div key={c.id} className="px-6 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-md ${PLATFORM_BADGE[c.platform] ?? 'bg-slate-100 text-slate-500'}`}>{c.platform}</span>
                  <span className="text-sm font-medium text-slate-800 truncate">{c.name}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_STYLES[c.status]}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAnalytics(period).then(d => { setData(d); setLoading(false); });
  }, [period]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-20 text-slate-400">No data available</div>;

  const { summary, trend, by_platform, campaigns: campaignMetrics } = data;
  const maxSpend = trend.length ? Math.max(...trend.map((d: any) => d.spend), 0.01) : 1;

  return (
    <div className="space-y-6">
      {data.is_mock && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Demo data shown — connect Google + Meta next week to see real campaign performance
        </div>
      )}

      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900 text-lg">Performance Overview</h2>
        <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {([7, 30, 90] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 text-sm font-semibold transition-colors ${period === p ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total Spend" value={`$${summary.spend.toFixed(0)}`} />
        <KpiCard label="Conversions" value={String(summary.conversions)} />
        <KpiCard label="Avg CPA" value={`$${summary.cpa.toFixed(2)}`} />
        <KpiCard label="ROAS" value={`${summary.roas.toFixed(1)}x`} good={summary.roas >= 2} />
        <KpiCard label="Avg CTR" value={`${summary.ctr.toFixed(2)}%`} good={summary.ctr >= 1.5} />
      </div>

      {/* Spend trend chart */}
      {trend.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">Daily Spend — last {period} days</p>
          <div className="flex items-end gap-0.5 h-24">
            {trend.map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col justify-end group relative">
                <div
                  className="bg-indigo-500 hover:bg-indigo-600 rounded-sm transition-colors"
                  style={{ height: `${Math.max(2, (d.spend / maxSpend) * 96)}px` }}
                />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">
                  {d.date}: ${d.spend}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>{trend[0]?.date}</span>
            <span>{trend[trend.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Platform breakdown */}
      {Object.keys(by_platform).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">Platform Breakdown</p>
          <div className="space-y-4">
            {Object.entries(by_platform).map(([platform, p]: [string, any]) => (
              <div key={platform}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${PLATFORM_BADGE[platform] ?? 'bg-slate-100 text-slate-500'}`}>{platform}</span>
                  </div>
                  <div className="flex gap-6 text-xs text-slate-500">
                    <span>Spend: <strong className="text-slate-800">${p.spend}</strong></span>
                    <span>CTR: <strong className="text-slate-800">{p.ctr}%</strong></span>
                    <span>ROAS: <strong className="text-slate-800">{p.roas}x</strong></span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div className={`h-1.5 rounded-full ${platform === 'google' ? 'bg-blue-500' : platform === 'meta' ? 'bg-violet-500' : 'bg-slate-600'}`} style={{ width: `${p.spend_pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign table */}
      {campaignMetrics?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">Campaign Performance</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Campaign', 'Platform', 'Spend', 'Impressions', 'CTR', 'Conversions', 'CPA', 'ROAS'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {campaignMetrics.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[180px]">{c.name}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${PLATFORM_BADGE[c.platform] ?? 'bg-slate-100'}`}>{c.platform}</span></td>
                    <td className="px-4 py-3 text-slate-600">${c.spend}</td>
                    <td className="px-4 py-3 text-slate-600">{c.impressions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-slate-600">{c.ctr}%</td>
                    <td className="px-4 py-3 text-slate-600">{c.conversions}</td>
                    <td className="px-4 py-3 text-slate-600">${c.cpa}</td>
                    <td className={`px-4 py-3 font-semibold ${c.roas >= 2 ? 'text-emerald-600' : c.roas >= 1 ? 'text-amber-600' : 'text-red-600'}`}>{c.roas}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Campaigns Tab ─────────────────────────────────────────────────────────────

function CampaignsTab({ campaigns, isPending, onAction, activeCampaigns, pausedCampaigns, errorCampaigns }: any) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-900 text-lg">All Campaigns</h2>
        <div className="flex gap-3 text-xs text-slate-400">
          <span className="text-emerald-600 font-semibold">{activeCampaigns} active</span>
          {pausedCampaigns > 0 && <span>{pausedCampaigns} paused</span>}
          {errorCampaigns > 0 && <span className="text-red-500 font-semibold">{errorCampaigns} error</span>}
        </div>
      </div>
      {campaigns.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">No campaigns yet — launch from Overview</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="divide-y divide-slate-50">
            {campaigns.map((c: Campaign) => (
              <div key={c.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-md ${PLATFORM_BADGE[c.platform] ?? 'bg-slate-100 text-slate-500'}`}>{c.platform}</span>
                    <span className="text-sm font-semibold text-slate-900 truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-400 capitalize">{c.campaign_type}</span>
                    <span className="text-xs text-slate-400">${c.daily_budget_usd}/day</span>
                    {c.error_message && <span className="text-xs text-red-500 truncate">{c.error_message}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                  {c.status === 'active' && <button onClick={() => onAction(c.id, 'pause')} disabled={isPending} className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50">Pause</button>}
                  {c.status === 'paused' && <button onClick={() => onAction(c.id, 'resume')} disabled={isPending} className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50">Resume</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Creative Tab ──────────────────────────────────────────────────────────────

const VIDEO_OPTIONS = [
  { type: 'avatar' as const,    label: 'Talking Avatar', provider: 'HeyGen',  price: 15, desc: 'AI spokesperson — best for product demos & explainers', badge: 'Recommended' },
  { type: 'cinematic' as const, label: 'Cinematic',      provider: 'Kling',   price: 12, desc: 'Photorealistic scenes generated from your script' },
  { type: 'animation' as const, label: 'Animation',      provider: 'Pika',    price: 8,  desc: 'Eye-catching animated video — works great on TikTok & Meta' },
] as const;

type VideoType = 'avatar' | 'cinematic' | 'animation';

type CreativeJob = {
  id: string;
  type: VideoType;
  platform: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'pending_setup';
  output_url: string | null;
  brief: Record<string, any>;
  created_at: string;
};

function CreativeTab({ settings }: any) {
  const [platform, setPlatform] = useState('google');
  const [copyResult, setCopyResult] = useState<any>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [scoreForm, setScoreForm] = useState({ type: 'avatar', description: '', audience: '' });
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  // Video generation
  const [selectedVideoType, setSelectedVideoType] = useState<VideoType>('avatar');
  const [videoScript, setVideoScript] = useState('');
  const [briefApproved, setBriefApproved] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoJob, setVideoJob] = useState<any>(null);
  const [jobs, setJobs] = useState<CreativeJob[]>([]);

  useEffect(() => {
    getCreatives().then(res => setJobs(res?.jobs ?? []));
  }, []);

  // Poll processing jobs
  useEffect(() => {
    const processing = jobs.filter(j => j.status === 'queued' || j.status === 'processing');
    if (processing.length === 0) return;
    const interval = setInterval(async () => {
      const updates = await Promise.all(processing.map(j => getCreativeStatus(j.id)));
      setJobs(prev => prev.map(j => {
        const upd = updates.find((u: any) => u?.job_id === j.id);
        return upd ? { ...j, status: upd.status, output_url: upd.output_url ?? j.output_url } : j;
      }));
    }, 8000);
    return () => clearInterval(interval);
  }, [jobs]);

  async function handleGenerateCopy() {
    setCopyLoading(true); setCopyResult(null);
    const res = await generateAdCopy(platform, settings?.goal ?? 'leads', settings?.website_url ?? '', (settings?.geo_include ?? []).join(', '));
    setCopyResult(res);
    setCopyLoading(false);
  }

  async function handleScore() {
    if (!scoreForm.description) return;
    setScoreLoading(true); setScoreResult(null);
    const res = await scoreCreative(scoreForm.type, scoreForm.description, scoreForm.audience, platform, settings?.goal ?? 'leads');
    setScoreResult(res);
    setScoreLoading(false);
  }

  async function handleGenerateVideo() {
    if (!videoScript.trim()) return;
    setVideoLoading(true); setVideoJob(null);
    const brief = selectedVideoType === 'avatar'
      ? { script: videoScript, avatar_id: 'Anna_public_3_20240108', voice_id: 'en-US-AriaNeural' }
      : selectedVideoType === 'cinematic'
      ? { prompt: videoScript, duration: 5, aspect_ratio: '16:9' }
      : { prompt: videoScript, style: 'cinematic', duration: 3 };

    const res = await generateCreative(selectedVideoType, brief, platform);
    setVideoJob(res);
    setBriefApproved(false);
    if (res?.job_id) {
      setJobs(prev => [{ id: res.job_id, type: selectedVideoType, platform, status: res.status, output_url: null, brief, created_at: new Date().toISOString() }, ...prev]);
    }
    setVideoLoading(false);
  }

  const statusColor = (s: string) =>
    s === 'completed' ? 'bg-emerald-100 text-emerald-700' :
    s === 'processing' || s === 'queued' ? 'bg-blue-100 text-blue-700' :
    s === 'failed' ? 'bg-red-100 text-red-700' :
    'bg-amber-100 text-amber-700';

  return (
    <div className="space-y-6">
      {/* Platform selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-600">Platform:</span>
        {['google', 'meta', 'tiktok'].map(p => (
          <button key={p} onClick={() => setPlatform(p)} className={`px-3 py-1.5 text-sm font-semibold rounded-lg capitalize transition-colors ${platform === p ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>{p}</button>
        ))}
      </div>

      {/* ── Video Production ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div>
          <h3 className="font-bold text-slate-900">Video Production</h3>
          <p className="text-sm text-slate-500 mt-0.5">AI generates your ad video — 1 free revision included</p>
        </div>

        {/* Video type cards */}
        <div className="grid grid-cols-3 gap-3">
          {VIDEO_OPTIONS.map(opt => (
            <button
              key={opt.type}
              onClick={() => setSelectedVideoType(opt.type)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${selectedVideoType === opt.type ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-900 text-sm">{opt.label}</span>
                {'badge' in opt && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">{opt.badge}</span>}
              </div>
              <p className="text-xs text-slate-500 mb-2 leading-relaxed">{opt.desc}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">via {opt.provider}</span>
                <span className="text-sm font-black text-slate-900">${opt.price}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Script / prompt input */}
        <textarea
          value={videoScript}
          onChange={e => { setVideoScript(e.target.value); setBriefApproved(false); }}
          placeholder={
            selectedVideoType === 'avatar'
              ? 'Write the script your AI avatar will say. E.g. "Hi! Are you tired of X? Our solution helps you Y in just Z days. Click below to get started."'
              : selectedVideoType === 'cinematic'
              ? 'Describe the scene. E.g. "A confident professional walks into a modern office. Text overlay: Your tagline. CTA appears at end."'
              : 'Describe the animation. E.g. "Bright animated logo reveal, bold product name, energetic bounce effects, strong CTA button at end."'
          }
          rows={4}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />

        {/* Step 1: Preview Brief */}
        {!briefApproved ? (
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {selectedVideoType === 'avatar' ? 'Estimated 3 min · 16:9 · 720p' : selectedVideoType === 'cinematic' ? 'Estimated 5 min · 5–10 sec clip · 16:9' : 'Estimated 4 min · 3 sec loop · 16:9'}
            </p>
            <button
              onClick={() => setBriefApproved(true)}
              disabled={!videoScript.trim()}
              className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
            >
              Preview Brief →
            </button>
          </div>
        ) : (
          /* Step 2: Brief Approval */
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 space-y-4">
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Brief Review</p>
            <div className="bg-white rounded-lg p-4 border border-indigo-100 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Type</span>
                <span className="font-semibold text-slate-900 capitalize">{selectedVideoType} · {VIDEO_OPTIONS.find(o => o.type === selectedVideoType)?.provider}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Platform</span>
                <span className="font-semibold text-slate-900 capitalize">{platform}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Cost</span>
                <span className="font-bold text-indigo-600">${VIDEO_OPTIONS.find(o => o.type === selectedVideoType)?.price}</span>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-1">Your {selectedVideoType === 'avatar' ? 'script' : 'prompt'}</p>
                <p className="text-sm text-slate-700 italic">"{videoScript}"</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700 space-y-1">
              <p className="font-semibold">Policy</p>
              <p>· 1 free revision included — request it from the job list after delivery</p>
              <p>· Additional revisions: $5 each</p>
              <p>· Delivery: 3–5 minutes after approval</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setBriefApproved(false)}
                className="flex-1 border border-slate-200 text-slate-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Edit Brief
              </button>
              <button
                onClick={handleGenerateVideo}
                disabled={videoLoading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                {videoLoading ? 'Submitting...' : 'Approve & Generate'}
              </button>
            </div>
          </div>
        )}

        {/* Job submitted feedback */}
        {videoJob && (
          <div className={`rounded-xl p-4 text-sm ${videoJob.status === 'pending_setup' ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
            {videoJob.status === 'pending_setup'
              ? <p className="text-amber-800">{videoJob.message}</p>
              : <p className="text-emerald-800">Video generation started — check the job list below for status. You'll receive your video in 3–5 minutes.</p>
            }
          </div>
        )}

        {/* Job list */}
        {jobs.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recent Jobs</p>
            {jobs.slice(0, 5).map(job => (
              <div key={job.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-800 capitalize">{job.type}</span>
                  {job.platform && <span className="text-xs text-slate-400 capitalize">{job.platform}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${statusColor(job.status)}`}>{job.status.replace('_', ' ')}</span>
                  {job.status === 'completed' && job.output_url && (
                    <a href={job.output_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">View</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Ad Copy Generator ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Ad Copy Generator</h3>
            <p className="text-sm text-slate-500 mt-0.5">AI writes 6 high-converting variations for {platform}</p>
          </div>
          <button onClick={handleGenerateCopy} disabled={copyLoading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
            {copyLoading ? 'Generating...' : 'Generate Copy'}
          </button>
        </div>

        {copyResult?.variations?.length > 0 && (
          <div className="space-y-3 pt-2">
            {copyResult.variations.map((v: any) => (
              <div key={v.variation} className="border border-slate-200 rounded-xl p-4 space-y-2 hover:border-indigo-200 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase">Variation {v.variation}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{v.tone_tag}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${v.predicted_score >= 80 ? 'bg-emerald-100 text-emerald-700' : v.predicted_score >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      Score: {v.predicted_score}
                    </span>
                  </div>
                </div>
                {v.headline_1 && <p className="text-sm font-semibold text-slate-900">"{v.headline_1}{v.headline_2 ? ` | ${v.headline_2}` : ''}"</p>}
                {v.description_1 && <p className="text-sm text-slate-600">{v.description_1}</p>}
                {v.body && <p className="text-xs text-slate-500 italic">{v.body}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">{v.cta}</span>
                  <button onClick={() => navigator.clipboard?.writeText(`${v.headline_1}\n${v.description_1}`)} className="text-xs text-slate-400 hover:text-slate-600 ml-auto">Copy</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Creative Scoring ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-slate-900">Creative Scoring</h3>
          <p className="text-sm text-slate-500 mt-0.5">Get a 0-100 score and improvement tips before you spend</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {['avatar', 'cinematic', 'animation', 'image', 'text'].map(t => (
            <button key={t} onClick={() => setScoreForm(f => ({ ...f, type: t }))} className={`py-2 text-sm font-semibold rounded-xl capitalize transition-colors ${scoreForm.type === t ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-slate-300'}`}>{t}</button>
          ))}
        </div>
        <textarea
          value={scoreForm.description}
          onChange={e => setScoreForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Describe your creative: what does it show? What's the hook? What's the CTA?"
          rows={3}
          className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        <input
          value={scoreForm.audience}
          onChange={e => setScoreForm(f => ({ ...f, audience: e.target.value }))}
          placeholder="Target audience (e.g. 'Women 25-40 interested in fitness')"
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button onClick={handleScore} disabled={scoreLoading || !scoreForm.description} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
          {scoreLoading ? 'Scoring...' : 'Score Creative'}
        </button>

        {scoreResult && (
          <div className="border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <span className={`text-4xl font-black ${scoreResult.score >= 80 ? 'text-emerald-600' : scoreResult.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{scoreResult.score}</span>
                  <span className={`text-2xl font-bold ${scoreResult.score >= 80 ? 'text-emerald-600' : scoreResult.score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{scoreResult.grade}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{scoreResult.verdict}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Predicted CTR</p>
                <p className="text-lg font-bold text-slate-900">{scoreResult.predicted_ctr}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${scoreResult.recommended_action === 'launch' ? 'bg-emerald-100 text-emerald-700' : scoreResult.recommended_action === 'tweak' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  {scoreResult.recommended_action === 'launch' ? 'Ready to launch' : scoreResult.recommended_action === 'tweak' ? 'Needs tweaks' : 'Rework needed'}
                </span>
              </div>
            </div>
            {scoreResult.breakdown && (
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(scoreResult.breakdown).map(([k, v]: [string, any]) => (
                  <div key={k} className="text-center">
                    <div className="text-sm font-bold text-slate-800">{v}</div>
                    <div className="text-xs text-slate-400 capitalize">{k.replace('_', ' ')}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-emerald-700 mb-1.5">Strengths</p>
                {scoreResult.strengths?.map((s: string, i: number) => <p key={i} className="text-slate-600 flex gap-1.5"><span className="text-emerald-500">✓</span>{s}</p>)}
              </div>
              <div>
                <p className="font-semibold text-amber-700 mb-1.5">Improve</p>
                {scoreResult.improvements?.map((s: string, i: number) => <p key={i} className="text-slate-600 flex gap-1.5"><span className="text-amber-500">→</span>{s}</p>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Intelligence Tab ──────────────────────────────────────────────────────────

function IntelligenceTab({ settings, connected }: any) {
  const [audiences, setAudiences] = useState<any[]>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(false);
  const [territory, setTerritory] = useState<any>(null);
  const [competitors, setCompetitors] = useState<any>(null);
  const [competitorKeyword, setCompetitorKeyword] = useState('');

  useEffect(() => {
    if (settings) {
      getTerritoryIntel(settings.geo_include ?? [], settings.website_url ?? '', settings.goal ?? 'leads').then(setTerritory);
    }
  }, [settings]);

  async function handleDiscoverAudiences() {
    setAudiencesLoading(true);
    const res = await discoverAudiences(settings, settings?.website_url ?? '');
    setAudiences(res?.audiences ?? []);
    setAudiencesLoading(false);
  }

  async function handleCompetitors() {
    const res = await getCompetitors(competitorKeyword, territory?.detected_country);
    setCompetitors(res);
  }

  return (
    <div className="space-y-6">
      {/* Territory Intelligence */}
      {territory && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Territory Intelligence</h3>
            <span className="text-sm font-semibold text-indigo-600">{territory.detected_country} · {territory.currency?.symbol}{territory.currency?.code}</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {territory.cpc_benchmarks && Object.entries(territory.cpc_benchmarks).map(([k, v]: [string, any]) => (
              <div key={k} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-1 capitalize">{k.replace(/_/g, ' ')}</p>
                <p className="font-bold text-slate-800 text-sm">{v}</p>
              </div>
            ))}
          </div>
          {territory.market_insights && <p className="text-sm text-slate-600 leading-relaxed">{territory.market_insights}</p>}
          {territory.upcoming_events?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Upcoming Events</p>
              <div className="space-y-2">
                {territory.upcoming_events.map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${e.relevance === 'high' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{e.date}</span>
                    <span className="font-medium text-slate-800">{e.name}</span>
                    <span className="text-slate-400 text-xs">{e.action}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {territory.localization_tips?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Localization Tips</p>
              {territory.localization_tips.map((t: string, i: number) => <p key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-indigo-400">→</span>{t}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Audience Discovery */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Audience Discovery</h3>
            <p className="text-sm text-slate-500 mt-0.5">AI finds profitable audience segments you haven't tested</p>
          </div>
          <button onClick={handleDiscoverAudiences} disabled={audiencesLoading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
            {audiencesLoading ? 'Discovering...' : 'Discover Audiences'}
          </button>
        </div>
        {audiences.length > 0 && (
          <div className="grid md:grid-cols-2 gap-3">
            {audiences.map((a: any) => (
              <div key={a.id} className="border border-slate-200 rounded-xl p-4 space-y-2 hover:border-indigo-200 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 text-sm">{a.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a.potential === 'high' ? 'bg-emerald-100 text-emerald-700' : a.potential === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{a.potential}</span>
                    <span className="text-xs text-slate-400">{a.size}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">{a.description}</p>
                {a.interests?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.interests.slice(0, 3).map((int: string) => <span key={int} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{int}</span>)}
                  </div>
                )}
                <p className="text-xs text-slate-400">{a.reasoning}</p>
                <div className="flex gap-1">
                  {(a.platforms ?? []).map((p: string) => <span key={p} className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${PLATFORM_BADGE[p] ?? 'bg-slate-100 text-slate-500'}`}>{p}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Competitive Intelligence */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-slate-900">Competitive Intelligence</h3>
          <p className="text-sm text-slate-500 mt-0.5">See what ads your competitors are running</p>
        </div>
        {!connected.meta ? (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-600">Connect Meta to unlock competitor intelligence</p>
            <p className="text-xs text-slate-400">Uses Facebook Ad Library — shows all active ads in your market</p>
            <a href="/onboarding" className="text-xs text-indigo-600 font-medium hover:text-indigo-700">Connect Meta →</a>
          </div>
        ) : (
          <div className="flex gap-3">
            <input
              value={competitorKeyword}
              onChange={e => setCompetitorKeyword(e.target.value)}
              placeholder="Search competitor brand or keyword..."
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button onClick={handleCompetitors} disabled={!competitorKeyword} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">Search</button>
          </div>
        )}
        {competitors?.ads?.length === 0 && competitors?.connected && (
          <p className="text-sm text-slate-400 text-center py-4">No ads found for this keyword</p>
        )}
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ settings, connected }: any) {
  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="font-bold text-slate-900 text-lg">Campaign Settings</h2>
      {settings && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          {[
            { label: 'Website', value: settings.website_url ?? '—' },
            { label: 'Monthly Budget', value: `₪${settings.budget_monthly_ils?.toLocaleString()}` },
            { label: 'Managed %', value: `${settings.management_percentage ?? 100}%` },
            { label: 'Goal', value: settings.goal, capitalize: true },
            { label: 'Targeting', value: (settings.geo_include ?? []).join(', ') || '—' },
          ].map(item => (
            <div key={item.label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-500 font-medium">{item.label}</span>
              <span className={`text-sm font-semibold text-slate-800 ${item.capitalize ? 'capitalize' : ''}`}>{item.value}</span>
            </div>
          ))}
          <a href="/onboarding" className="block text-center text-sm text-indigo-600 hover:text-indigo-700 font-semibold pt-2">Edit Settings →</a>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-4">Connected Platforms</h3>
        <div className="space-y-3">
          {[
            { name: 'Google Ads', platform: 'google', connected: connected.google },
            { name: 'Meta Ads', platform: 'meta', connected: connected.meta },
            { name: 'TikTok Ads', platform: 'tiktok', connected: false, soon: true },
          ].map(p => (
            <div key={p.platform} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <span className="text-sm font-semibold text-slate-800">{p.name}</span>
              {p.soon
                ? <span className="text-xs bg-slate-100 text-slate-400 px-2.5 py-1 rounded-full font-semibold">Coming Soon</span>
                : p.connected
                ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">Connected ✓</span>
                : <a href="/onboarding" className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-semibold hover:bg-indigo-100 transition-colors">Connect →</a>
              }
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-1">Alert Channels</h3>
        <p className="text-sm text-slate-500 mb-4">Get notified when campaigns need attention</p>
        <div className="space-y-2 text-sm text-slate-500">
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <span>Email alerts</span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">Setup next week</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span>WhatsApp alerts</span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">Setup next week</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const valueColors: Record<string, string> = { green: 'text-emerald-600', blue: 'text-blue-600', purple: 'text-violet-600', gray: 'text-slate-600' };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <p className="text-xs text-slate-400 font-medium mb-2">{label}</p>
      <p className={`text-2xl font-bold ${valueColors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function KpiCard({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
      <p className="text-xs text-slate-400 font-medium mb-2">{label}</p>
      <p className={`text-xl font-bold ${good === true ? 'text-emerald-600' : good === false ? 'text-red-500' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function AlertCard({ alert, onDismiss }: { alert: any; onDismiss: () => void }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  return (
    <div className={`border rounded-xl p-4 flex items-start justify-between gap-4 ${styles[alert.severity] ?? styles.info}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">{alert.title}</p>
        <p className="text-xs mt-0.5 opacity-80">{alert.message}</p>
        {alert.action && <p className="text-xs mt-1 font-medium opacity-70">→ {alert.action}</p>}
      </div>
      <button onClick={onDismiss} className="text-lg leading-none opacity-50 hover:opacity-100 flex-shrink-0">×</button>
    </div>
  );
}

function PlatformBadge({ name, connected }: { name: string; connected: boolean }) {
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
      {name} {connected ? '✓' : '–'}
    </span>
  );
}
