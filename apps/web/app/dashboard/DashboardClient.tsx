'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import {
  getDashboardData, launchCampaigns, pauseCampaign, resumeCampaign, updateCampaignBudget,
  getAnalytics, getAnalyticsDaily, getConversionIntelligence, getTrackingStatus,
  generateAdCopy, scoreCreative, discoverAudiences,
  getTerritoryIntel, getCompetitors, getBudgetPacing, getAlerts, dismissAlert,
  generateCreative, getCreatives, getCreativeStatus, rejectCreative,
  createAbTest, getAbTests, concludeAbTest, getAbTestRecommendation,
  analyzeCreativeElements, getBudgetShiftRecommendation, applyBudgetShifts,
  runCroAudit, getAlertSettings, saveAlertSettings, sendTestAlert,
  runOptimizationNow, getOptimizationHistory, getOptimizationSettings, saveOptimizationSettings,
  getApprovalRequests, approveRequest, rejectRequest,
  getProtocols, getProtocol, replyToProtocol, approveProtocol, rejectProtocol,
  pauseAllCampaigns, resumeAllCampaigns,
  deleteAccount, getExportUrl,
  getSocialSettings, updateSocialSettings, getSocialPosts, approveSocialPost, rejectSocialPost,
  generateSocialContent, getSocialAnalytics,
  getSocialComments, sendSocialCommentReply, ignoreSocialComment, hideSocialComment, cancelCoolingOff,
  getMetaAdAccounts, selectMetaAdAccount, type MetaAdAccount,
  getMetaPages, selectMetaPage, type MetaPage,
  getMetaScopes, disconnectMeta,
  updateSocialPost, deleteSocialPost,
  getGa4Properties, getGa4Settings, setGa4Property, runGa4Sync, type Ga4Property,
  getStrategy, rerunAnalysisServer,
  getReadinessScore, runReadinessAudit,
  runGeoAudit, getGeoReport, getHistoryTimeline,
  exportAnalyticsCSV, exportAnalyticsHTML,
  exportCampaignsCSV, exportCampaignsHTML,
  exportSocialCSV, exportSocialHTML,
  exportMarketingPlanHTML, exportInvoiceHTML,
  scoreCreativeAsset, getCreativeThemes, getBudgetForecast,
  getBrandAssets, deleteBrandAsset, uploadBrandAsset, generatePostImage,
  getCreativeBrief, generateCreativeBrief,
} from './actions';
import FeedbackModal from './FeedbackModal';
import { ClerkSignOutButton } from '../components/sign-out-button';
import LanguageSelector from '../components/LanguageSelector';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'strategy' | 'analytics' | 'campaigns' | 'creative' | 'intelligence' | 'geo' | 'history' | 'protocols' | 'social' | 'settings';

type Campaign = {
  id: string; platform: 'google' | 'meta' | 'tiktok';
  name: string; campaign_type: string;
  status: 'pending' | 'active' | 'paused' | 'error';
  daily_budget_usd: number; error_message: string | null;
  created_at: string;
};

// Learning period days per campaign type (mirrors engine/rules.ts benchmarks)
function getLearningDays(platform: string, campaignType: string): number {
  if (campaignType === 'conversions') return 10;
  if (platform === 'google' && campaignType === 'retargeting') return 5;
  return 7;
}
function getDaysRunning(createdAt: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)));
}

type DashboardData = {
  onboardingComplete: boolean; settings: any;
  connected: { google: boolean; meta: boolean; tiktok?: boolean };
  campaigns: Campaign[];
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', paused: 'bg-amber-100 text-amber-700',
  pending: 'bg-blue-100 text-blue-700', error: 'bg-red-100 text-red-700',
};
const STATUS_LABELS: Record<string, string> = {
  active: 'active', paused: 'paused', pending: 'activating', error: 'error',
};
const PLATFORM_BADGE: Record<string, string> = {
  google: 'text-blue-600 bg-blue-50', meta: 'text-violet-600 bg-violet-50', tiktok: 'text-slate-700 bg-slate-100',
};

type NavItem = { key: Tab; labelKey: string; icon: React.ReactNode };
type NavGroup = { heading: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'MAIN',
    items: [
      { key: 'overview', labelKey: 'tabs.overview', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
      { key: 'campaigns', labelKey: 'tabs.campaigns', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
      { key: 'social', labelKey: 'tabs.social', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg> },
      { key: 'creative', labelKey: 'tabs.creative', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg> },
    ],
  },
  {
    heading: 'INTELLIGENCE',
    items: [
      { key: 'strategy', labelKey: 'tabs.strategy', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> },
      { key: 'analytics', labelKey: 'tabs.analytics', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
      { key: 'intelligence', labelKey: 'tabs.intelligence', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
      { key: 'geo', labelKey: 'tabs.geo', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg> },
    ],
  },
  {
    heading: 'ACCOUNT',
    items: [
      { key: 'history', labelKey: 'tabs.history', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { key: 'protocols', labelKey: 'tabs.protocols', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
      { key: 'settings', labelKey: 'tabs.settings', icon: <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
    ],
  },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const t = useTranslations('dashboard');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showStopModal, setShowStopModal] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [pendingProtocolCount, setPendingProtocolCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  useEffect(() => {
    load();
    getAlerts().then(r => setUnreadCount(r?.unread_count ?? 0));
    getProtocols('pending').then(r => setPendingProtocolCount(r?.protocols?.length ?? 0));
    // After Google OAuth from dashboard, refresh connection status and stay in Social tab
    if (searchParams?.get('connected') === 'google') {
      setTab('social');
      load();
    }
  }, []);

  async function handleLaunch() {
    setLaunching(true); setError(null);
    try {
      const result = await launchCampaigns(true);
      if (result?._error) {
        const msg = result.error ?? 'Launch failed';
        setError(msg === 'industry_attestation_required'
          ? 'This business category requires a license attestation before advertising. Go to Settings → Compliance to upload your license.'
          : msg === 'conversion_readiness_block'
          ? 'Your landing page needs improvements before paid campaigns. Check Strategy → Readiness for details.'
          : msg);
      } else {
        await load();
      }
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Launch failed'); }
    finally { setLaunching(false); }
  }

  async function handleEmergencyStop() {
    setStopping(true);
    try { await pauseAllCampaigns(); await load(); }
    catch { /* ignore */ }
    finally { setStopping(false); setShowStopModal(false); }
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
  const activeCampaigns  = campaigns.filter(c => c.status === 'active').length;
  const pausedCampaigns  = campaigns.filter(c => c.status === 'paused').length;
  const errorCampaigns   = campaigns.filter(c => c.status === 'error').length;
  const pendingCampaigns = campaigns.filter(c => c.status === 'pending').length;
  const totalDailyBudget = campaigns.filter(c => c.status === 'active').reduce((s, c) => s + c.daily_budget_usd, 0);
  const managedBudget = settings ? Math.round((settings.budget_monthly_ils / 3.7) * ((settings.management_percentage ?? 100) / 100)) : 0;
  const feeEstimate = Math.round(managedBudget * 0.07);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Toggle navigation"
              onClick={() => setSidebarOpen(o => !o)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Image src="/logo_nav.png" alt="Vigmis" width={180} height={40} priority />
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <PlatformBadge name="Google" connected={connected.google} />
              <PlatformBadge name="Meta" connected={connected.meta} />
              {connected.tiktok
              ? <PlatformBadge name="TikTok" connected={true} />
              : <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-400 font-medium">{t('status.tiktokSoon')}</span>
            }
            </div>
            <div className="flex items-center gap-4 text-sm">
              <button
                onClick={() => setTab('overview')}
                className="relative text-slate-400 hover:text-slate-700 transition-colors"
                title={unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}` : 'Alerts'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <a href="/studio" className="text-slate-500 hover:text-slate-800 font-medium transition-colors">{t('buttons.creativeStudio')}</a>
              <a href="/settings/general" className="text-slate-500 hover:text-slate-800 font-medium transition-colors">{t('tabs.settings')}</a>
              <a href="/billing" className="text-slate-500 hover:text-slate-800 font-medium transition-colors">{t('buttons.billing')}</a>
              <LanguageSelector />
              <ClerkSignOutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Platform status bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-2">
        <div className="max-w-6xl mx-auto flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">{t('status.connections')}</span>
          {[
            { name: 'Google Ads', key: 'google' as const, connected: connected.google },
            { name: 'Meta Ads', key: 'meta' as const, connected: connected.meta },
            { name: 'TikTok', key: 'tiktok' as const, connected: !!connected.tiktok },
          ].map(p => (
            <span
              key={p.key}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                p.connected
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${p.connected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {p.name}
              {!p.connected && (
                <button
                  onClick={async () => {
                    if (p.key === 'tiktok') { setTab('social'); return; }
                    try {
                      const tok = await (window as any).Clerk?.session?.getToken();
                      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
                      window.location.href = `${apiUrl}/auth/${p.key}?token=${encodeURIComponent(tok ?? '')}&return=dashboard`;
                    } catch { setTab('social'); }
                  }}
                  className="ml-0.5 underline underline-offset-2 hover:no-underline text-amber-600"
                >
                  {t('buttons.connect')}
                </button>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Body: sidebar + content */}
      <div className="flex min-h-[calc(100vh-112px)] rtl:flex-row-reverse" dir="auto">

        {/* Vertical sidebar */}
        <aside
          className={[
            'fixed md:sticky top-[112px] z-30 h-[calc(100vh-112px)] w-[220px] bg-slate-50 border-slate-200 overflow-y-auto flex-shrink-0 flex flex-col py-4 transition-transform duration-200',
            'ltr:border-r rtl:border-l',
            sidebarOpen ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full md:translate-x-0',
            'ltr:left-0 rtl:right-0',
          ].join(' ')}
        >
          {NAV_GROUPS.map(group => (
            <div key={group.heading} className="mb-4">
              <p className="px-4 mb-1 text-[10px] font-bold tracking-widest text-slate-400 uppercase select-none">
                {group.heading}
              </p>
              {group.items.map(item => {
                const isActive = tab === item.key;
                return (
                  <div key={item.key} className="px-2">
                  <button
                    onClick={() => { setTab(item.key); setSidebarOpen(false); }}
                    className={[
                      'w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors text-start rounded-lg',
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    ].join(' ')}
                  >
                    {item.icon}
                    <span className="truncate">{t(item.labelKey)}</span>
                    {item.key === 'protocols' && pendingProtocolCount > 0 && (
                      <span className="ms-auto bg-amber-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">
                        {pendingProtocolCount}
                      </span>
                    )}
                  </button>
                  </div>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 px-6 py-8">
        {error && <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

        {tab === 'overview' && (
          <OverviewTab
            campaigns={campaigns} settings={settings}
            activeCampaigns={activeCampaigns} pausedCampaigns={pausedCampaigns}
            pendingCampaigns={pendingCampaigns}
            errorCampaigns={errorCampaigns} totalDailyBudget={totalDailyBudget}
            managedBudget={managedBudget} feeEstimate={feeEstimate}
            onViewAll={() => setTab('campaigns')}
            launching={launching} onLaunch={handleLaunch}
            onEmergencyStop={() => setShowStopModal(true)}
            onGeoTab={() => setTab('geo')}
            onSocialTab={() => setTab('social')}
            onCreativeTab={() => setTab('creative')}
          />
        )}
        {tab === 'strategy' && <StrategyTab settings={settings} />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'campaigns' && (
          <CampaignsTab
            campaigns={campaigns} isPending={isPending}
            onAction={handleCampaignAction}
            onReload={load}
            activeCampaigns={activeCampaigns} pausedCampaigns={pausedCampaigns} errorCampaigns={errorCampaigns}
          />
        )}
        {tab === 'creative' && <CreativeTab settings={settings} />}
        {tab === 'intelligence' && <IntelligenceTab settings={settings} connected={connected} campaigns={campaigns} />}
        {tab === 'geo' && <GeoTab settings={settings} />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'protocols' && <ProtocolsTab />}
        {tab === 'social' && <SocialTab metaConnected={connected.meta} googleConnected={connected.google} />}
        {tab === 'settings' && <SettingsTab settings={settings} connected={connected} />}
        </main>
      </div>

      <FeedbackModal />

      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
              </div>
              <h3 className="font-bold text-slate-900 text-lg">{t('buttons.emergencyStop')}</h3>
            </div>
            <p className="text-sm text-slate-600">
              {t('status.emergencyStopBody', { count: activeCampaigns })}
            </p>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowStopModal(false)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                {t('buttons.cancel')}
              </button>
              <button onClick={handleEmergencyStop} disabled={stopping} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl transition-colors">
                {stopping ? t('status.stopping') : t('buttons.pauseAllNow')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Change indicator ──────────────────────────────────────────────────────────

function ChangeTag({ pct, inverse = false }: { pct: number | null | undefined; inverse?: boolean }) {
  if (pct === null || pct === undefined) return <span className="text-xs text-slate-400">—</span>;
  const good = inverse ? pct < 0 : pct > 0;
  const neutral = pct === 0;
  return (
    <span className={`text-xs font-bold ${neutral ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-red-500'}`}>
      {pct > 0 ? '↑' : pct < 0 ? '↓' : '→'}{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── Burn gauge (CSS-only circular indicator) ──────────────────────────────────

function BurnGauge({ pctSpent, pctElapsed, status }: { pctSpent: number; pctElapsed: number; status: string }) {
  const color = status === 'on_track' ? '#059669' : status === 'overspending' ? '#dc2626' : '#d97706';
  const label = status === 'on_track' ? 'On Track' : status === 'overspending' ? 'Over' : 'Under';
  const radius = 38;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pctSpent / 100) * circ;
  const elapsedOffset = circ - (pctElapsed / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="2"
          strokeDasharray={circ} strokeDashoffset={elapsedOffset}
          strokeLinecap="round" transform="rotate(-90 50 50)" opacity="0.6" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 50 50)" />
        <text x="50" y="46" textAnchor="middle" fontSize="14" fontWeight="800" fill="#0f172a">{pctSpent.toFixed(0)}%</text>
        <text x="50" y="60" textAnchor="middle" fontSize="9" fill="#64748b">spent</text>
      </svg>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${status === 'on_track' ? 'bg-emerald-100 text-emerald-700' : status === 'overspending' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{label}</span>
    </div>
  );
}

// ── Platform health dot ───────────────────────────────────────────────────────

function PlatformDot({ platform, health }: { platform: string; health: { active: number; paused: number; error: number } | undefined }) {
  if (!health) return null;
  const color = health.error > 0 ? 'bg-red-500' : health.active === 0 ? 'bg-slate-300' : health.paused > 0 ? 'bg-amber-400' : 'bg-emerald-500';
  const label = health.error > 0 ? 'Issue' : health.active === 0 ? 'Idle' : 'Active';
  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color} shadow-sm`} />
      <span className={`text-xs font-bold uppercase ${PLATFORM_BADGE[platform]?.split(' ')[1] ?? 'text-slate-600'}`}>{platform}</span>
      <span className="text-xs text-slate-400">{health.active}▶ {health.paused}⏸</span>
    </div>
  );
}

// ── Export menu ───────────────────────────────────────────────────────────────

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function openPrintWindow(html: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function ExportMenu({ items }: { items: { label: string; action: () => Promise<void> }[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setOpen(false);
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
      >
        {busy ? <span className="w-3 h-3 border border-indigo-600 border-t-transparent rounded-full animate-spin" /> : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        )}
        Export
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[180px]">
            {items.map(item => (
              <button key={item.label} onClick={() => run(item.action)} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ campaigns, settings, activeCampaigns, pausedCampaigns, pendingCampaigns, errorCampaigns, totalDailyBudget, managedBudget, feeEstimate, launching, onLaunch, onViewAll, onEmergencyStop, onGeoTab, onSocialTab, onCreativeTab }: any) {
  const t = useTranslations('dashboard');
  const [alerts, setAlerts] = useState<any[]>([]);
  const [daily, setDaily] = useState<any>(null);
  const [convIntel, setConvIntel] = useState<any>(null);
  const [trackingStatus, setTrackingStatus] = useState<any>(null);
  const [geoReport, setGeoReport] = useState<any>(null);

  useEffect(() => {
    getAlerts().then(r => setAlerts(r?.alerts ?? []));
    getAnalyticsDaily().then(setDaily);
    getConversionIntelligence(30).then(setConvIntel);
    getTrackingStatus().then(setTrackingStatus);
    getGeoReport().then(r => setGeoReport(r?.exists ? r : null));
  }, []);

  const pacing = daily?.pacing;
  const platformHealth = daily?.platform_health ?? {};
  const recentActions = daily?.recent_actions ?? [];

  return (
    <div className="space-y-5">
      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex items-start gap-2">
        <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span><strong>Disclaimer:</strong> Vigmis provides AI-driven campaign management on a best-effort basis. Results are not guaranteed. You retain full control and can pause all campaigns at any time.</span>
      </div>

      {/* Platform health bar */}
      {campaigns.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 mr-1">{t('status.platformStatus')}</span>
          {(['google', 'meta', 'tiktok'] as const).map(p => (
            platformHealth[p] ? <PlatformDot key={p} platform={p} health={platformHealth[p]} /> : null
          ))}
          {activeCampaigns > 0 && (
            <button onClick={onEmergencyStop} className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
              {t('buttons.emergencyStop')}
            </button>
          )}
        </div>
      )}

      {/* Today's live KPIs */}
      {daily && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Today at a Glance</p>
              <p className="text-sm text-slate-500 mt-0.5">vs yesterday · {daily.is_mock && <span className="italic">simulated</span>}</p>
            </div>
            {pacing && <BurnGauge pctSpent={pacing.pct_spent} pctElapsed={pacing.pct_elapsed} status={pacing.status} />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: 'Spend', val: `$${daily.today.spend.toFixed(0)}`, chg: daily.changes?.spend },
              { label: 'ROAS', val: `${daily.today.roas.toFixed(1)}x`, chg: daily.changes?.roas },
              { label: 'Conv.', val: String(daily.today.conversions), chg: daily.changes?.conversions },
              { label: 'CPA', val: `$${daily.today.conversions > 0 ? (daily.today.spend / daily.today.conversions).toFixed(0) : '—'}`, chg: daily.changes?.cpa, inv: true },
              { label: 'CTR', val: `${daily.today.ctr.toFixed(1)}%`, chg: daily.changes?.ctr },
              { label: 'Impr.', val: daily.today.impressions > 0 ? `${(daily.today.impressions / 1000).toFixed(1)}k` : '—', chg: daily.changes?.impressions },
            ].map(({ label, val, chg, inv }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
                <p className="text-lg font-black text-slate-900">{val}</p>
                <div className="mt-0.5"><ChangeTag pct={chg} inverse={inv} /></div>
              </div>
            ))}
          </div>
          {pacing && (
            <p className="text-xs text-slate-400 mt-3">
              <span className="font-semibold">Burn rate:</span> ${pacing.spend_today?.toFixed(2)} spent of ${pacing.budget_today?.toFixed(0)} daily budget ({pacing.pct_elapsed?.toFixed(0)}% of day elapsed)
            </p>
          )}
        </div>
      )}

      {/* AI Visibility (GEO) score card */}
      {geoReport && (
        <button onClick={onGeoTab} className="w-full text-left bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-indigo-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-full border-4 flex flex-col items-center justify-center flex-shrink-0 ${
                (geoReport.score ?? 0) >= 80 ? 'border-emerald-400' : (geoReport.score ?? 0) >= 60 ? 'border-amber-400' : 'border-red-400'
              }`}>
                <span className={`text-lg font-black ${(geoReport.score ?? 0) >= 80 ? 'text-emerald-600' : (geoReport.score ?? 0) >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{geoReport.grade ?? 'F'}</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">AI Visibility Score</p>
                <p className="text-base font-bold text-slate-900 mt-0.5">{geoReport.score ?? 0}/100 — How AI systems find your business</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {(geoReport.issues ?? []).filter((i: any) => i.severity === 'critical').length} critical issues ·{' '}
                  {(geoReport.issues ?? []).filter((i: any) => i.severity === 'warning').length} warnings · Tap to view full report
                </p>
              </div>
            </div>
            <svg className="w-5 h-5 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </div>
        </button>
      )}

      {/* Conversion Intelligence — True ROAS vs Platform ROAS */}
      {convIntel && (
        <div className={`border-2 rounded-2xl p-5 shadow-sm ${
          convIntel.data_source === 'none'
            ? 'border-slate-200 bg-white'
            : 'border-indigo-200 bg-indigo-50'
        }`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Conversion Intelligence — last 30 days</p>
              <p className="text-sm text-slate-500 mt-0.5">
                {convIntel.data_source === 'shopify'
                  ? 'Source: Shopify orders (most accurate)'
                  : convIntel.data_source === 'pixel'
                  ? 'Source: Vigmis pixel events'
                  : 'Install tracking pixel to see real conversion data'}
              </p>
            </div>
            {convIntel.data_source !== 'none' && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                convIntel.data_source === 'shopify' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
              }`}>
                {convIntel.conversions_tracked} orders tracked
              </span>
            )}
          </div>

          {convIntel.data_source === 'none' ? (
            <div className="flex items-center gap-4">
              <div className="flex-1 text-sm text-slate-500 leading-relaxed">
                Without tracking, you're relying on what the ad platforms tell you — which is often <strong>2–3× inflated</strong> due to multi-platform attribution.
              </div>
              <a
                href="/onboarding?rethink=true"
                className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
              >
                Install pixel →
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl p-4 border border-indigo-100 text-center">
                <p className="text-xs text-slate-400 font-medium mb-1">Platform ROAS</p>
                <p className="text-2xl font-black text-slate-400">{convIntel.platform_roas.toFixed(1)}x</p>
                <p className="text-xs text-slate-300 mt-1">What platforms claim</p>
              </div>
              <div className={`rounded-xl p-4 border text-center ${
                convIntel.true_roas !== null
                  ? convIntel.true_roas >= convIntel.platform_roas * 0.7
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-red-50 border-red-200'
                  : 'bg-white border-slate-200'
              }`}>
                <p className="text-xs text-slate-500 font-medium mb-1">True ROAS</p>
                <p className={`text-2xl font-black ${
                  convIntel.true_roas !== null
                    ? convIntel.true_roas >= convIntel.platform_roas * 0.7 ? 'text-emerald-700' : 'text-red-700'
                    : 'text-slate-300'
                }`}>
                  {convIntel.true_roas !== null ? `${convIntel.true_roas.toFixed(1)}x` : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-1">Based on real orders</p>
              </div>
              {convIntel.true_profit !== null ? (
                <div className={`rounded-xl p-4 border text-center ${
                  convIntel.true_profit >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                }`}>
                  <p className="text-xs text-slate-500 font-medium mb-1">True Profit</p>
                  <p className={`text-2xl font-black ${convIntel.true_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {convIntel.true_profit >= 0 ? '+' : ''}{convIntel.true_profit >= 1000 ? `$${(convIntel.true_profit / 1000).toFixed(1)}k` : `$${convIntel.true_profit.toFixed(0)}`}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{convIntel.margin_pct}% margin applied</p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                  <p className="text-xs text-amber-600 font-medium mb-1">True Profit</p>
                  <p className="text-xl font-black text-amber-400">—</p>
                  <p className="text-xs text-amber-500 mt-1">Add margin% in settings</p>
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400 font-medium mb-1">Revenue Tracked</p>
                <p className="text-2xl font-black text-slate-900">
                  {convIntel.revenue_tracked >= 1000
                    ? `$${(convIntel.revenue_tracked / 1000).toFixed(1)}k`
                    : `$${convIntel.revenue_tracked.toFixed(0)}`}
                </p>
                <p className="text-xs text-slate-400 mt-1">vs ${convIntel.spend.toFixed(0)} spend</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {alerts.filter((a: any) => !a.dismissed).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Active Alerts</p>
          {alerts.filter((a: any) => !a.dismissed).map((alert: any) => (
            <AlertCard key={alert.id} alert={alert} onDismiss={async () => {
              await dismissAlert(alert.id);
              setAlerts(prev => prev.map((a: any) => a.id === alert.id ? { ...a, dismissed: true } : a));
            }} />
          ))}
        </div>
      )}

      {/* Pending campaigns banner */}
      {pendingCampaigns > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
          <div className="w-4 h-4 border-2 border-blue-400 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
          <span className="text-blue-800 font-medium">{pendingCampaigns} campaign{pendingCampaigns > 1 ? 's' : ''} activating on the ad platform — this usually takes a few minutes.</span>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Campaigns" value={String(activeCampaigns)} sub={pausedCampaigns ? `${pausedCampaigns} paused` : undefined} color="green" />
        <StatCard label="Daily Budget" value={`$${totalDailyBudget.toFixed(0)}`} sub="active spend" color="blue" />
        <StatCard label="Managed / Month" value={`$${managedBudget}`} sub="of ad budget" color="purple" />
        <StatCard label="Monthly Fee" value={`~$${feeEstimate}`} sub="7% of managed" color="gray" />
      </div>

      {/* Vigmis AI Actions (last 24h) */}
      {recentActions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-3">Vigmis AI Actions — last 24h</p>
          <div className="space-y-2">
            {recentActions.slice(0, 5).map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0 text-sm">
                  {a.action.includes('scale') ? '📈' : a.action.includes('pause') ? '⏸' : a.action.includes('resume') ? '▶️' : '🤖'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 capitalize">{a.action.replace(/_/g, ' ')}</p>
                  {a.campaign && <p className="text-xs text-slate-400 truncate">{a.campaign}</p>}
                </div>
                <span className="text-xs text-slate-300 flex-shrink-0">{new Date(a.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Getting started — no data at all */}
      {campaigns.length === 0 && !daily && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 flex items-start gap-4">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div>
            <p className="text-sm font-bold text-indigo-900">{t('empty.welcomeTitle')}</p>
            <p className="text-xs text-indigo-700 mt-1 leading-relaxed">{t('empty.welcomeBody')}</p>
          </div>
        </div>
      )}

      {/* Launch */}
      {campaigns.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-5 shadow-sm">
          <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('empty.readyToLaunchTitle')}</h2>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">{t('empty.readyToLaunchBody')}</p>
          </div>
          <button onClick={onLaunch} disabled={launching} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-8 py-3 rounded-xl transition-colors shadow-sm">
            {launching ? t('status.launching') : t('buttons.launchCampaigns')}
          </button>
        </div>
      )}

      {/* Next Steps — shown after campaigns are launched */}
      {campaigns.length > 0 && onSocialTab && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-bold text-indigo-900">Recommended next steps</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={onSocialTab} className="flex items-center gap-3 bg-white border border-indigo-200 rounded-xl px-4 py-3 text-left hover:border-indigo-400 transition-colors group">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200 transition-colors">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Generate Social Posts</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Create this week's Facebook & Instagram content</p>
              </div>
            </button>
            <button onClick={onCreativeTab} className="flex items-center gap-3 bg-white border border-indigo-200 rounded-xl px-4 py-3 text-left hover:border-indigo-400 transition-colors group">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200 transition-colors">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">Create a Creative</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Generate an image or video ad for your campaigns</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Campaigns mini list */}
      {campaigns.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">{t('tabs.campaigns')}</h2>
            <button onClick={onViewAll} className="text-xs text-indigo-600 font-medium">{t('buttons.viewAll')}</button>
          </div>
          <div className="divide-y divide-slate-50">
            {campaigns.slice(0, 5).map((c: Campaign) => {
              const daysRunning = c.created_at ? getDaysRunning(c.created_at) : 999;
              const learningDays = getLearningDays(c.platform, c.campaign_type);
              const isLearning = c.status === 'active' && daysRunning < learningDays;
              const daysLeft = Math.max(0, learningDays - daysRunning);
              return (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-md flex-shrink-0 ${PLATFORM_BADGE[c.platform] ?? 'bg-slate-100 text-slate-500'}`}>{c.platform}</span>
                    <span className="text-sm font-medium text-slate-800 truncate">{c.name}</span>
                    {isLearning && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold flex-shrink-0">Learning · {daysLeft}d</span>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const t = useTranslations('dashboard');
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [compare, setCompare] = useState(true);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>('roas');

  useEffect(() => {
    setLoading(true);
    getAnalytics(period, compare).then(d => { setData(d); setLoading(false); });
  }, [period, compare]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return (
    <div className="text-center py-20 space-y-3">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
        <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
      </div>
      <p className="text-slate-700 font-semibold">{t('empty.noAnalytics')}</p>
      <p className="text-sm text-slate-400 max-w-xs mx-auto">{t('empty.noAnalyticsBody')}</p>
    </div>
  );

  const { summary, trend, by_platform, campaigns: campaignMetrics, changes, top_performers, bottom_performers } = data;
  const maxSpend = trend?.length ? Math.max(...trend.map((d: any) => d.spend), 0.01) : 1;
  const maxConv = trend?.length ? Math.max(...trend.map((d: any) => d.conversions), 0.01) : 1;

  const sorted = [...(campaignMetrics ?? [])].sort((a: any, b: any) => {
    if (sortBy === 'roas') return b.roas - a.roas;
    if (sortBy === 'spend') return b.spend - a.spend;
    if (sortBy === 'cpa') return a.cpa - b.cpa;
    if (sortBy === 'conversions') return b.conversions - a.conversions;
    return 0;
  });

  const safeRoas = isFinite(summary.roas) && summary.roas >= 0 ? summary.roas : null;
  const safeCpa = isFinite(summary.cpa) && summary.cpa > 0 ? summary.cpa : null;
  const safeCtr = isFinite(summary.ctr) ? summary.ctr : 0;
  const kpis = [
    { label: 'Total Spend', val: `$${(summary.spend ?? 0).toFixed(0)}`, chg: changes?.spend },
    { label: 'Conv. Value', val: `$${(summary.convValue ?? 0).toFixed(0)}`, chg: changes?.convValue },
    { label: 'Conversions', val: String(summary.conversions ?? 0), chg: changes?.conversions },
    { label: 'ROAS', val: safeRoas !== null ? `${safeRoas.toFixed(1)}x` : '—', chg: changes?.roas, good: safeRoas !== null && safeRoas >= 2 },
    { label: 'CPA', val: safeCpa !== null ? `$${safeCpa.toFixed(0)}` : '—', chg: changes?.cpa, inv: true },
    { label: 'CTR', val: `${safeCtr.toFixed(2)}%`, chg: changes?.ctr, good: safeCtr >= 1.5 },
    { label: 'Clicks', val: (summary.clicks ?? 0).toLocaleString(), chg: changes?.clicks },
    { label: 'Impressions', val: `${((summary.impressions ?? 0) / 1000).toFixed(1)}k`, chg: changes?.impressions },
  ];

  return (
    <div className="space-y-6">
      {data.is_mock && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span><strong>Simulated data</strong> — projections based on your budget. Real ROAS/CPA will appear once Google and Meta API access is approved.</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-bold text-slate-900 text-lg">Performance Analytics</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer">
            <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} className="rounded" />
            Compare to prior period
          </label>
          <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {([7, 30, 90] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-4 py-2 text-sm font-semibold transition-colors ${period === p ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                {p}d
              </button>
            ))}
          </div>
          <ExportMenu items={[
            { label: '⬇ Download CSV (Excel)', action: async () => { const r = await exportAnalyticsCSV(period); if (r) downloadCSV(r.content, `vigmis-analytics-${period}d.csv`); } },
            { label: '🖨 Export PDF Report', action: async () => { const r = await exportAnalyticsHTML(period); if (r) openPrintWindow(r.content); } },
          ]} />
        </div>
      </div>

      {/* KPI grid with WoW arrows */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(({ label, val, chg, good, inv }) => (
          <div key={label} className={`bg-white border rounded-xl p-4 shadow-sm ${good === true ? 'border-emerald-200' : good === false ? 'border-red-100' : 'border-slate-200'}`}>
            <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
            <p className={`text-2xl font-black ${good === true ? 'text-emerald-600' : good === false ? 'text-red-500' : 'text-slate-900'}`}>{val}</p>
            {compare && <div className="mt-1"><ChangeTag pct={chg} inverse={inv} /></div>}
          </div>
        ))}
      </div>

      {/* Conversion funnel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <p className="text-sm font-semibold text-slate-700 mb-4">Conversion Funnel</p>
        <div className="space-y-2">
          {[
            { label: 'Impressions', val: summary.impressions, color: 'bg-slate-300', pct: 100 },
            { label: 'Clicks', val: summary.clicks, color: 'bg-indigo-400', pct: summary.impressions > 0 ? (summary.clicks / summary.impressions * 100) : 0, rate: `${summary.ctr.toFixed(2)}% CTR` },
            { label: 'Conversions', val: summary.conversions, color: 'bg-indigo-600', pct: summary.clicks > 0 ? (summary.conversions / summary.clicks * 100) : 0, rate: `${summary.clicks > 0 ? (summary.conversions / summary.clicks * 100).toFixed(1) : 0}% CVR` },
            { label: 'Conv. Value', val: `$${summary.convValue.toFixed(0)}`, color: 'bg-emerald-500', pct: summary.conversions > 0 ? Math.min(100, summary.convValue / summary.spend * 20) : 0, rate: `$${summary.conversions > 0 ? (summary.convValue / summary.conversions).toFixed(0) : 0} avg` },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-24 text-right">
                <p className="text-xs font-semibold text-slate-600">{row.label}</p>
                <p className="text-sm font-black text-slate-900">{typeof row.val === 'number' ? row.val.toLocaleString() : row.val}</p>
              </div>
              <div className="flex-1">
                <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
                  <div className={`h-7 ${row.color} rounded-lg transition-all duration-500`} style={{ width: `${Math.max(2, row.pct)}%` }} />
                </div>
              </div>
              {row.rate && <span className="text-xs text-slate-400 w-20">{row.rate}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Dual chart: Spend + Conversions */}
      {trend?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-700">Daily Trend — last {period} days</p>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-indigo-500 rounded-sm inline-block" />Spend</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-emerald-500 rounded-sm inline-block" />Conversions</span>
            </div>
          </div>
          <div className="flex items-end gap-px h-28">
            {trend.map((d: any, i: number) => (
              <div key={i} className="flex-1 flex flex-col justify-end gap-px group relative">
                <div className="bg-emerald-400 hover:bg-emerald-500 rounded-t-sm transition-colors" style={{ height: `${Math.max(2, (d.conversions / maxConv) * 40)}px` }} />
                <div className="bg-indigo-500 hover:bg-indigo-600 rounded-t-sm transition-colors" style={{ height: `${Math.max(2, (d.spend / maxSpend) * 60)}px` }} />
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                  {d.date}<br />${d.spend} · {d.conversions} conv
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-2">
            <span>{trend[0]?.date}</span><span>{trend[trend.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Platform breakdown */}
      {Object.keys(by_platform ?? {}).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">Platform Breakdown</p>
          <div className="space-y-5">
            {Object.entries(by_platform).map(([platform, p]: [string, any]) => (
              <div key={platform}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${PLATFORM_BADGE[platform] ?? 'bg-slate-100 text-slate-500'}`}>{platform}</span>
                  <div className="flex gap-4 text-xs">
                    <span className="text-slate-500">Spend <strong className="text-slate-800">${p.spend}</strong></span>
                    <span className="text-slate-500">CTR <strong className="text-slate-800">{p.ctr}%</strong></span>
                    <span className="text-slate-500">ROAS <strong className={`${p.roas >= 2 ? 'text-emerald-600' : p.roas >= 1 ? 'text-amber-600' : 'text-red-500'}`}>{p.roas}x</strong></span>
                    {compare && p.changes && <ChangeTag pct={p.changes?.roas} />}
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full">
                  <div className={`h-2 rounded-full ${platform === 'google' ? 'bg-blue-500' : platform === 'meta' ? 'bg-violet-500' : 'bg-slate-500'}`} style={{ width: `${p.spend_pct}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-1">{p.spend_pct}% of total spend</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top + Bottom performers */}
      {(top_performers?.length > 0 || bottom_performers?.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {top_performers?.length > 0 && (
            <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                <p className="text-sm font-bold text-emerald-800">⭐ Top Performers</p>
              </div>
              <div className="divide-y divide-slate-50">
                {top_performers.map((c: any, i: number) => (
                  <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-black text-slate-400 w-4">{i + 1}</span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${PLATFORM_BADGE[c.platform] ?? ''}`}>{c.platform}</span>
                      <span className="text-xs font-medium text-slate-700 truncate">{c.name.replace('VIGMIS_', '').replace(/_/g, ' ').toLowerCase()}</span>
                    </div>
                    <span className="text-sm font-black text-emerald-600 flex-shrink-0">{c.roas}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {bottom_performers?.length > 0 && (
            <div className="bg-white border border-red-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
                <p className="text-sm font-bold text-red-700">⚠️ Needs Attention</p>
                <span className="text-xs text-red-500">ROAS below target — consider pausing or adjusting budget</span>
              </div>
              <div className="divide-y divide-slate-50">
                {bottom_performers.map((c: any) => (
                  <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${PLATFORM_BADGE[c.platform] ?? ''}`}>{c.platform}</span>
                      <span className="text-xs font-medium text-slate-700 truncate">{c.name.replace('VIGMIS_', '').replace(/_/g, ' ').toLowerCase()}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-sm font-black ${c.roas >= 1 ? 'text-amber-600' : 'text-red-500'}`}>{c.roas}x</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                <p className="text-xs text-slate-500">💡 Use <strong>Intelligence → Budget Shifting</strong> to reallocate budget from low to high performers automatically.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Campaign table with sort */}
      {sorted?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">All Campaigns</p>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              <option value="roas">Sort: ROAS ↓</option>
              <option value="spend">Sort: Spend ↓</option>
              <option value="conversions">Sort: Conversions ↓</option>
              <option value="cpa">Sort: CPA ↑</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Campaign', 'Platform', 'Spend', 'Impr.', 'CTR', 'Conv.', 'CPA', 'ROAS'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[160px]">{c.name.replace('VIGMIS_', '').replace(/_/g, ' ').toLowerCase()}</td>
                    <td className="px-4 py-3"><span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${PLATFORM_BADGE[c.platform] ?? 'bg-slate-100'}`}>{c.platform}</span></td>
                    <td className="px-4 py-3 text-slate-700 font-semibold">${c.spend}</td>
                    <td className="px-4 py-3 text-slate-500">{(c.impressions / 1000).toFixed(1)}k</td>
                    <td className="px-4 py-3 text-slate-500">{c.ctr}%</td>
                    <td className="px-4 py-3 text-slate-700 font-semibold">{c.conversions}</td>
                    <td className="px-4 py-3 text-slate-500">{c.cpa > 0 && isFinite(c.cpa) ? `$${c.cpa}` : '—'}</td>
                    <td className={`px-4 py-3 font-black text-base ${!isFinite(c.roas) || c.roas < 0 ? 'text-slate-400' : c.roas >= 2 ? 'text-emerald-600' : c.roas >= 1 ? 'text-amber-600' : 'text-red-500'}`}>{isFinite(c.roas) && c.roas >= 0 ? `${c.roas}x` : '—'}</td>
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

function CampaignsTab({ campaigns, isPending, onAction, onReload, activeCampaigns, pausedCampaigns, errorCampaigns }: any) {
  const t = useTranslations('dashboard');
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetConfirm, setBudgetConfirm] = useState<{ id: string; oldVal: number; newVal: number } | null>(null);

  function requestBudgetSave(id: string, oldVal: number) {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val < 1) return;
    if (Math.abs(val - oldVal) / oldVal > 0.25 || val >= 500) {
      setBudgetConfirm({ id, oldVal, newVal: val });
    } else {
      confirmBudgetSave(id, val);
    }
  }

  async function confirmBudgetSave(id: string, val: number) {
    setBudgetConfirm(null);
    setBudgetSaving(true);
    try {
      await updateCampaignBudget(id, val);
      setEditingBudget(null);
      onReload?.();
    } catch {
      // keep editing state on error
    } finally {
      setBudgetSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Budget change confirmation modal */}
      {budgetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4 space-y-4">
            <h3 className="font-bold text-slate-900">{t('buttons.confirmBudgetChange')}</h3>
            <p className="text-sm text-slate-600">{t('status.dailyBudgetLabel')}: <span className="line-through text-slate-400">${budgetConfirm.oldVal}</span> → <strong className={budgetConfirm.newVal > budgetConfirm.oldVal ? 'text-emerald-600' : 'text-amber-600'}>${budgetConfirm.newVal}/day</strong></p>
            <p className="text-xs text-slate-400">{t('status.budgetEffectImmediate')}</p>
            <div className="flex gap-2">
              <button onClick={() => setBudgetConfirm(null)} className="flex-1 border border-slate-200 text-slate-700 font-semibold py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors">{t('buttons.cancel')}</button>
              <button onClick={() => confirmBudgetSave(budgetConfirm.id, budgetConfirm.newVal)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-xl text-sm transition-colors">{t('buttons.confirm')}</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-slate-900 text-lg">{t('buttons.allCampaigns')}</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-xs text-slate-400">
            <span className="text-emerald-600 font-semibold">{t('status.countActive', { count: activeCampaigns })}</span>
            {pausedCampaigns > 0 && <span>{t('status.countPaused', { count: pausedCampaigns })}</span>}
            {campaigns.filter((c: any) => c.status === 'pending').length > 0 && <span className="text-blue-600 font-semibold">{t('status.countActivating', { count: campaigns.filter((c: any) => c.status === 'pending').length })}</span>}
            {errorCampaigns > 0 && <span className="text-red-500 font-semibold">{t('status.countError', { count: errorCampaigns })}</span>}
          </div>
          <ExportMenu items={[
            { label: '⬇ Download CSV (Excel)', action: async () => { const r = await exportCampaignsCSV(); if (r) downloadCSV(r.content, 'vigmis-campaigns.csv'); } },
            { label: '🖨 Export PDF Report', action: async () => { const r = await exportCampaignsHTML(); if (r) openPrintWindow(r.content); } },
            { label: '🖨 Marketing Plan PDF', action: async () => { const r = await exportMarketingPlanHTML(); if (r) openPrintWindow(r.content); } },
            { label: '🖨 Invoice PDF', action: async () => { const r = await exportInvoiceHTML(); if (r) openPrintWindow(r.content); } },
          ]} />
        </div>
      </div>
      {campaigns.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <p className="text-slate-700 font-semibold">{t('empty.noCampaigns')}</p>
          <p className="text-sm text-slate-400">{t('empty.noCampaignsBody')}</p>
        </div>
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
                    {editingBudget === c.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400">$</span>
                        <input
                          type="number"
                          value={budgetInput}
                          onChange={e => setBudgetInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') requestBudgetSave(c.id, c.daily_budget_usd); if (e.key === 'Escape') setEditingBudget(null); }}
                          className="w-20 text-xs border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          min={1}
                          step={1}
                          autoFocus
                        />
                        <span className="text-xs text-slate-400">/day</span>
                        <button onClick={() => requestBudgetSave(c.id, c.daily_budget_usd)} disabled={budgetSaving} className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded font-medium disabled:opacity-50">
                          {budgetSaving ? '...' : t('buttons.save')}
                        </button>
                        <button onClick={() => setEditingBudget(null)} className="text-xs text-slate-400 hover:text-slate-600">{t('buttons.cancel')}</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingBudget(c.id); setBudgetInput(String(c.daily_budget_usd)); }}
                        className="text-xs text-slate-400 hover:text-indigo-600 hover:underline transition-colors"
                        title="Click to edit budget"
                      >
                        ${c.daily_budget_usd}/day
                      </button>
                    )}
                    {c.error_message && (
                      <span className="text-xs text-red-500 truncate" title={c.error_message}>
                        {c.error_message} · <a href="mailto:support@vigmis.com" className="underline hover:text-red-700">{t('buttons.contactSupport')}</a>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_STYLES[c.status] ?? 'bg-slate-100 text-slate-500'}`}>{STATUS_LABELS[c.status] ? t(`status.${STATUS_LABELS[c.status]}`) : c.status}</span>
                  {c.status === 'active' && <button onClick={() => onAction(c.id, 'pause')} disabled={isPending} aria-label={`Pause ${c.name}`} className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50">{t('buttons.pause')}</button>}
                  {c.status === 'paused' && <button onClick={() => onAction(c.id, 'resume')} disabled={isPending} aria-label={`Resume ${c.name}`} className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50">{t('buttons.resume')}</button>}
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
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'pending_setup' | 'rejected';
  output_url: string | null;
  brief: Record<string, any>;
  created_at: string;
  approved?: boolean;
  revision_requested?: boolean;
};

// ── Agency Brain Types (mirror @vigmis/db) ────────────────────────────────────

type CreativeConceptItem = {
  type: 'animation' | 'cinematic' | 'avatar';
  platform: string;
  concept: string;
  script: string;
  rationale: string;
};

type CreativeBriefExtended = {
  messaging_pillars: { pillar: string; headline: string; hook: string; body: string; cta: string }[];
  tone_guide: { voice: string; examples: string[]; avoid: string[] };
  hooks: { google: string[]; meta: string[]; tiktok: string[] };
  creative_concepts: CreativeConceptItem[];
  audience_variants: { segment: string; message_angle: string; hook: string; platform: string }[];
  time_strategy: { morning: string; evening: string; weekend: string };
};

// ── Creative Brief Dialog ─────────────────────────────────────────────────────

type CreativeBriefData = {
  product?: string;
  message?: string;
  style?: string;
  cta?: string;
  restrictions?: string;
};

function CreativeBriefDialog({
  open,
  onClose,
  onProceed,
}: {
  open: boolean;
  onClose: () => void;
  onProceed: (data: CreativeBriefData | null) => void;
}) {
  const [product, setProduct] = useState('');
  const [message, setMessage] = useState('');
  const [style, setStyle] = useState('');
  const [cta, setCta] = useState('');

  if (!open) return null;

  function submit(useInputs: boolean) {
    const data: CreativeBriefData | null = useInputs
      ? { product: product.trim() || undefined, message: message.trim() || undefined, style: style.trim() || undefined, cta: cta.trim() || undefined }
      : null;
    // Reset fields for next open
    setProduct(''); setMessage(''); setStyle(''); setCta('');
    onProceed(data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Tell Vigmis what you need</h2>
          <p className="text-sm text-slate-500 mt-0.5">All fields are optional — Vigmis will fill in any gaps automatically.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">What product or service is this for?</label>
            <input
              type="text"
              value={product}
              onChange={e => setProduct(e.target.value)}
              placeholder="e.g. Summer sale, new product launch"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Key message or offer?</label>
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="e.g. 30% off this week only"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Any style preferences?</label>
            <input
              type="text"
              value={style}
              onChange={e => setStyle(e.target.value)}
              placeholder="e.g. professional, fun, minimalist"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Contact info / CTA to include?</label>
            <input
              type="text"
              value={cta}
              onChange={e => setCta(e.target.value)}
              placeholder="e.g. vigmis.com, +972-50-xxx"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            onClick={() => submit(true)}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
          >
            Generate with my inputs →
          </button>
          <button
            onClick={() => submit(false)}
            className="flex-1 border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
          >
            Generate automatically (Vigmis decides)
          </button>
        </div>
        <button
          onClick={() => { setProduct(''); setMessage(''); setStyle(''); setCta(''); onClose(); }}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CreativeTab({ settings }: any) {
  const t = useTranslations('dashboard');
  const [platform, setPlatform] = useState('google');
  const [copyResult, setCopyResult] = useState<any>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [scoreForm, setScoreForm] = useState({ type: 'avatar', description: '', audience: '' });
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  // Creative brief dialog
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefData, setBriefData] = useState<CreativeBriefData | null>(null);
  // pendingAction tracks which action opened the brief dialog
  const [pendingAction, setPendingAction] = useState<'video' | 'copy' | null>(null);

  // Video generation
  const [selectedVideoType, setSelectedVideoType] = useState<VideoType>('avatar');
  const [videoScript, setVideoScript] = useState('');
  const [briefApproved, setBriefApproved] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoJob, setVideoJob] = useState<any>(null);
  const [jobs, setJobs] = useState<CreativeJob[]>([]);

  // Pre-launch creative scoring (G1)
  const [jobScores, setJobScores] = useState<Record<string, any>>({});
  const [scoringJobId, setScoringJobId] = useState<string | null>(null);

  // Agency Brain: AI creative recommendations
  const [creativeBrief, setCreativeBrief] = useState<CreativeBriefExtended | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefNoStrategy, setBriefNoStrategy] = useState(false);
  const [briefRegenerating, setBriefRegenerating] = useState(false);
  // Manual form visibility (collapsed by default once we have AI recommendations)
  const [manualFormOpen, setManualFormOpen] = useState(false);

  useEffect(() => {
    getCreatives().then(res => setJobs(res?.jobs ?? []));
  }, []);

  // Load AI creative brief on mount
  useEffect(() => {
    setBriefLoading(true);
    getCreativeBrief().then(res => {
      if (!res || res._no_strategy) {
        setBriefNoStrategy(!res || res._no_strategy);
        setBriefLoading(false);
        setManualFormOpen(true); // show manual form if no brief
        return;
      }
      if (res.brief) {
        setCreativeBrief(res.brief as CreativeBriefExtended);
      } else {
        // No cached brief yet — generate one now
        generateCreativeBrief({ force_regenerate: false }).then(genRes => {
          if (genRes?.brief) setCreativeBrief(genRes.brief as CreativeBriefExtended);
          else if (genRes?._no_strategy) setBriefNoStrategy(true);
        });
      }
      setBriefLoading(false);
    });
  }, []);

  async function handleRegenerateBrief() {
    setBriefRegenerating(true);
    const res = await generateCreativeBrief({ force_regenerate: true });
    if (res?.brief) setCreativeBrief(res.brief as CreativeBriefExtended);
    setBriefRegenerating(false);
  }

  function useConceptScript(concept: CreativeConceptItem) {
    setVideoScript(concept.script);
    setSelectedVideoType(concept.type);
    setBriefApproved(false);
    setManualFormOpen(true);
    // Scroll to video production section after a tick
    setTimeout(() => {
      document.getElementById('video-production-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

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

  // Open the brief dialog before any content generation
  function openBriefFor(action: 'video' | 'copy') {
    setPendingAction(action);
    setBriefOpen(true);
  }

  // Called by CreativeBriefDialog when user clicks either proceed button
  async function proceedWithBrief(data: CreativeBriefData | null) {
    setBriefOpen(false);
    setBriefData(data);
    if (pendingAction === 'copy') {
      await runGenerateCopy(data);
    } else if (pendingAction === 'video') {
      await runGenerateVideo(data);
    }
    setPendingAction(null);
  }

  async function runGenerateCopy(brief: CreativeBriefData | null) {
    setCopyLoading(true); setCopyResult(null);
    // Pass brief context via the goal/website fields so the existing API receives it.
    // The AI will use these hints naturally in the generated copy.
    const goal = [settings?.goal ?? 'leads', brief?.message].filter(Boolean).join(' — ');
    const website = [settings?.website_url ?? '', brief?.cta].filter(Boolean).join(' ');
    const audience = [
      (settings?.geo_include ?? []).join(', '),
      brief?.product ? `Product: ${brief.product}` : '',
      brief?.style ? `Style: ${brief.style}` : '',
    ].filter(Boolean).join('. ');
    const res = await generateAdCopy(platform, goal, website, audience);
    setCopyResult(res);
    setCopyLoading(false);
  }

  async function runGenerateVideo(brief: CreativeBriefData | null) {
    if (!videoScript.trim()) return;
    setVideoLoading(true); setVideoJob(null);
    // Prepend brief context to the script/prompt when provided
    const scriptWithBrief = brief
      ? [
          brief.product ? `Product: ${brief.product}` : '',
          brief.message ? `Key message: ${brief.message}` : '',
          brief.style ? `Style: ${brief.style}` : '',
          brief.cta ? `CTA: ${brief.cta}` : '',
          videoScript,
        ].filter(Boolean).join('\n')
      : videoScript;

    const videoBrief = selectedVideoType === 'avatar'
      ? { script: scriptWithBrief, avatar_id: 'Anna_public_3_20240108', voice_id: 'en-US-AriaNeural' }
      : selectedVideoType === 'cinematic'
      ? { prompt: scriptWithBrief, duration: 5, aspect_ratio: '16:9' }
      : { prompt: scriptWithBrief, style: 'cinematic', duration: 3 };

    const res = await generateCreative(selectedVideoType, videoBrief, platform);
    setVideoJob(res);
    setBriefApproved(false);
    if (res?.job_id) {
      setJobs(prev => [{ id: res.job_id, type: selectedVideoType, platform, status: res.status, output_url: null, brief: videoBrief, created_at: new Date().toISOString() }, ...prev]);
    }
    setVideoLoading(false);
  }

  // Keep old names as shims that open the brief dialog instead
  function handleGenerateCopy() { openBriefFor('copy'); }
  function handleGenerateVideo() { if (!videoScript.trim()) return; openBriefFor('video'); }

  async function handleScore() {
    if (!scoreForm.description) return;
    setScoreLoading(true); setScoreResult(null);
    const res = await scoreCreative(scoreForm.type, scoreForm.description, scoreForm.audience, platform, settings?.goal ?? 'leads');
    setScoreResult(res);
    setScoreLoading(false);
  }

  async function handleScoreJob(jobId: string, imageUrl: string) {
    setScoringJobId(jobId);
    const res = await scoreCreativeAsset(imageUrl, platform, settings?.goal ?? 'awareness');
    setJobScores(prev => ({ ...prev, [jobId]: res }));
    setScoringJobId(null);
  }

  const statusColor = (s: string) =>
    s === 'completed' ? 'bg-emerald-100 text-emerald-700' :
    s === 'processing' || s === 'queued' ? 'bg-blue-100 text-blue-700' :
    s === 'failed' ? 'bg-red-100 text-red-700' :
    'bg-amber-100 text-amber-700';

  return (
    <div className="space-y-6">
      {/* Creative Brief Dialog */}
      <CreativeBriefDialog
        open={briefOpen}
        onClose={() => { setBriefOpen(false); setPendingAction(null); }}
        onProceed={proceedWithBrief}
      />

      {/* Platform selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-600">Platform:</span>
        {['google', 'meta', 'tiktok'].map(p => (
          <button key={p} onClick={() => setPlatform(p)} className={`px-3 py-1.5 text-sm font-semibold rounded-lg capitalize transition-colors ${platform === p ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>{p}</button>
        ))}
      </div>

      {/* ── AI Creative Recommendations ──────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900">AI Creative Recommendations</h3>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">Agency Brain</span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">Ready-to-use concepts built from your strategy analysis</p>
          </div>
          {creativeBrief && !briefLoading && (
            <button
              onClick={handleRegenerateBrief}
              disabled={briefRegenerating}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold disabled:opacity-50 border border-indigo-200 bg-white px-3 py-1.5 rounded-lg transition-colors"
            >
              {briefRegenerating ? 'Regenerating...' : 'Regenerate'}
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {briefLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 space-y-3 animate-pulse">
                <div className="flex gap-2">
                  <div className="h-5 w-16 bg-slate-200 rounded-full" />
                  <div className="h-5 w-12 bg-slate-100 rounded-full" />
                </div>
                <div className="h-4 w-3/4 bg-slate-200 rounded" />
                <div className="h-3 w-full bg-slate-100 rounded" />
                <div className="h-3 w-5/6 bg-slate-100 rounded" />
                <div className="h-8 w-full bg-slate-200 rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* No strategy state */}
        {!briefLoading && briefNoStrategy && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center space-y-2">
            <p className="text-sm font-semibold text-amber-800">Run your strategy analysis to unlock AI creative concepts</p>
            <p className="text-xs text-amber-600">Go to the Strategy tab and click "Run Analysis" — this takes about 5 minutes and powers all AI recommendations.</p>
          </div>
        )}

        {/* Concept cards */}
        {!briefLoading && !briefNoStrategy && creativeBrief && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {creativeBrief.creative_concepts.map((concept, i) => {
                const typeBadgeColor =
                  concept.type === 'animation' ? 'bg-violet-100 text-violet-700' :
                  concept.type === 'cinematic' ? 'bg-blue-100 text-blue-700' :
                  'bg-emerald-100 text-emerald-700';
                const platformBadgeColor =
                  concept.platform === 'meta' ? 'bg-pink-100 text-pink-700' :
                  concept.platform === 'tiktok' ? 'bg-slate-900 text-white' :
                  'bg-amber-100 text-amber-700';
                const scriptPreview = concept.script.length > 100
                  ? concept.script.slice(0, 100) + '...'
                  : concept.script;
                return (
                  <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 hover:border-indigo-300 transition-colors flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${typeBadgeColor}`}>{concept.type}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${platformBadgeColor}`}>{concept.platform}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">{concept.concept}</p>
                    </div>
                    <div className="text-xs text-slate-500 leading-relaxed flex-1">
                      <p className="italic">"{scriptPreview}"</p>
                    </div>
                    {concept.rationale && (
                      <p className="text-xs text-indigo-600 font-medium leading-snug">{concept.rationale}</p>
                    )}
                    <button
                      onClick={() => useConceptScript(concept)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-xl text-sm transition-colors mt-auto"
                    >
                      Use This →
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Tone guide hint */}
            {creativeBrief.tone_guide && (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Brand Voice</p>
                  <p className="text-sm text-slate-700">{creativeBrief.tone_guide.voice}</p>
                  {creativeBrief.tone_guide.examples.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {creativeBrief.tone_guide.examples.map((ex, i) => (
                        <span key={i} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-lg italic">"{ex}"</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Generating state (brief exists but no concepts yet) */}
        {!briefLoading && briefRegenerating && !creativeBrief && (
          <div className="text-center py-6 text-sm text-slate-500">Generating your creative brief...</div>
        )}
      </div>

      {/* ── Manual Form Toggle ────────────────────────────────────────────── */}
      {!briefNoStrategy && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setManualFormOpen(v => !v)}
            className="text-sm text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1.5 transition-colors"
          >
            <span className={`transition-transform ${manualFormOpen ? 'rotate-90' : ''}`}>▶</span>
            {manualFormOpen ? 'Hide manual form' : 'or write your own ↓'}
          </button>
        </div>
      )}

      {/* ── Video Production ──────────────────────────────────────────────── */}
      {(manualFormOpen || briefNoStrategy) && (
      <div id="video-production-section" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div>
          <h3 className="font-bold text-slate-900">Video Production</h3>
          <p className="text-sm text-slate-500 mt-0.5">AI generates your ad video — 1 free revision included</p>
        </div>

        {/* Step 1: Choose video type */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Step 1: Choose video type</p>
          {/* Video type cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        </div>

        {/* Step 2: Write script */}
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Step 2: Write script or use AI suggestion above</p>
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
        </div>

        {/* Step 3: Preview & generate */}
        {!briefApproved ? (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Step 3: Preview &amp; generate</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {selectedVideoType === 'avatar' ? 'Estimated 3 min · 16:9 · 720p' : selectedVideoType === 'cinematic' ? 'Estimated 5 min · 5–10 sec clip · 16:9' : 'Estimated 4 min · 3 sec loop · 16:9'}
              </p>
              <div className="flex items-center gap-3">
                {!videoScript.trim() && (
                  <span className="text-xs text-slate-400 italic">Write a script above to continue</span>
                )}
                <button
                  onClick={() => setBriefApproved(true)}
                  disabled={!videoScript.trim()}
                  className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
                >
                  Preview Brief →
                </button>
              </div>
            </div>
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
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">{t('buttons.recentJobs')}</p>
          {jobs.length === 0 ? (
            <p className="text-sm text-slate-400 py-3 text-center">{t('empty.noVideos')}</p>
          ) : (
            <div className="space-y-4">
              {jobs.slice(0, 5).map(job => {
                const ageMin = Math.round((Date.now() - new Date(job.created_at).getTime()) / 60000);
                const stuck = (job.status === 'queued' || job.status === 'processing') && ageMin > 15;
                const isVideo = job.output_url && (job.output_url.endsWith('.mp4') || job.output_url.includes('video'));
                const needsApproval = job.status === 'completed' && job.output_url && !job.approved;
                const price = VIDEO_OPTIONS.find(o => o.type === job.type)?.price ?? 0;
                return (
                  <div key={job.id} className="border border-slate-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-semibold text-slate-800 capitalize">{job.type}</span>
                        {job.platform && <span className="text-xs text-slate-400 capitalize">{job.platform}</span>}
                        {stuck && <span className="text-xs text-amber-600 font-medium">Taking longer than expected</span>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${statusColor(job.status)}`}>
                          {job.approved ? 'approved' : job.status.replace('_', ' ')}
                        </span>
                        {job.status === 'completed' && job.output_url && job.approved && (
                          <a href={job.output_url} download className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold px-2.5 py-1 rounded-lg transition-colors">Download ↓</a>
                        )}
                        {stuck && <a href="mailto:support@vigmis.com" className="text-xs text-amber-600 hover:underline">Contact support</a>}
                      </div>
                    </div>

                    {/* B5: Preview before charge — shown when completed and not yet approved */}
                    {needsApproval && (
                      <div className="p-4 space-y-3">
                        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Preview — approve before you are charged</p>
                        {isVideo ? (
                          <video
                            src={job.output_url!}
                            controls
                            className="w-full max-h-64 rounded-lg bg-black"
                          />
                        ) : (
                          <img
                            src={job.output_url!}
                            alt="Generated creative preview"
                            className="w-full max-h-64 object-contain rounded-lg bg-slate-100"
                          />
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => setJobs(prev => prev.map(j => j.id === job.id ? { ...j, approved: true } : j))}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
                          >
                            Approve &amp; Pay ${price}
                          </button>
                          <button
                            onClick={() => setJobs(prev => prev.map(j => j.id === job.id ? { ...j, revision_requested: true } : j))}
                            disabled={job.revision_requested}
                            className="flex-1 border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
                          >
                            {job.revision_requested ? 'Revision requested' : 'Request revision (1 free)'}
                          </button>
                          <button
                            onClick={async () => {
                              await rejectCreative(job.id);
                              setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'rejected' } : j));
                            }}
                            className="border border-slate-200 text-slate-500 hover:bg-slate-50 font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
                          >
                            Discard — no charge
                          </button>
                        </div>
                      </div>
                    )}

                    {/* View link after approval */}
                    {job.status === 'completed' && job.output_url && job.approved && (
                      <div className="px-3 pb-2">
                        <a href={job.output_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                          View creative
                        </a>
                      </div>
                    )}

                    {/* G1: Pre-launch Creative Scoring */}
                    {job.status === 'completed' && job.output_url && (
                      <div className="px-3 pb-3 space-y-2">
                        {!jobScores[job.id] && (
                          <button
                            onClick={() => handleScoreJob(job.id, job.output_url!)}
                            disabled={scoringJobId === job.id}
                            className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {scoringJobId === job.id ? 'Scoring...' : 'Score this creative'}
                          </button>
                        )}
                        {jobScores[job.id] && (() => {
                          const s = jobScores[job.id];
                          const scoreColor =
                            s.score >= 80 ? 'text-emerald-600' :
                            s.score >= 60 ? 'text-amber-500' :
                            s.score >= 40 ? 'text-orange-500' : 'text-red-500';
                          const badgeBg =
                            s.score >= 80 ? 'bg-emerald-100 border-emerald-200' :
                            s.score >= 60 ? 'bg-amber-100 border-amber-200' :
                            s.score >= 40 ? 'bg-orange-100 border-orange-200' : 'bg-red-100 border-red-200';
                          return (
                            <div className={`border rounded-xl p-3 space-y-2 ${badgeBg}`}>
                              <div className="flex items-center gap-3">
                                <span className={`text-3xl font-black ${scoreColor}`}>{s.score}</span>
                                <div>
                                  <p className={`text-sm font-bold capitalize ${scoreColor}`}>{s.verdict}</p>
                                  <div className="flex gap-2 text-xs text-slate-500 mt-0.5">
                                    <span>Attention: {s.attention}</span>
                                    <span>Clarity: {s.clarity}</span>
                                    <span>Emotion: {s.emotion}</span>
                                    <span>CTA: {s.cta_presence}</span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => setJobScores(prev => { const n = { ...prev }; delete n[job.id]; return n; })}
                                  className="ml-auto text-xs text-slate-400 hover:text-slate-600"
                                >
                                  Re-score
                                </button>
                              </div>
                              {s.tips?.length > 0 && (
                                <ul className="space-y-0.5">
                                  {s.tips.map((tip: string, i: number) => (
                                    <li key={i} className="text-xs text-slate-600 flex gap-1.5">
                                      <span className="text-amber-500 flex-shrink-0">→</span>{tip}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )} {/* end manualFormOpen || briefNoStrategy */}

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
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={() => {
                        const text = [v.headline_1, v.description_1, v.body].filter(Boolean).join('\n');
                        setVideoScript(text);
                        setBriefApproved(false);
                        setManualFormOpen(true);
                        setTimeout(() => {
                          document.getElementById('video-production-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 100);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 rounded-lg transition-colors"
                    >
                      Use for Video →
                    </button>
                    <button onClick={() => navigator.clipboard?.writeText(`${v.headline_1}\n${v.description_1}`)} className="text-xs text-slate-400 hover:text-slate-600">Copy</button>
                  </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {['avatar', 'cinematic', 'animation', 'image', 'text'].map(opt => (
            <button key={opt} onClick={() => setScoreForm(f => ({ ...f, type: opt }))} className={`py-2 text-sm font-semibold rounded-xl capitalize transition-colors ${scoreForm.type === opt ? 'bg-indigo-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-slate-300'}`}>{opt}</button>
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

      {/* ── Brand & Creative Library ─────────────────────────────────────── */}
      <BrandAssetLibrary />
    </div>
  );
}

// ── Intelligence Tab ──────────────────────────────────────────────────────────

function IntelligenceTab({ settings, connected, campaigns }: any) {
  const t = useTranslations('dashboard');
  const [subTab, setSubTab] = useState<'territory' | 'audiences' | 'competitors' | 'ab' | 'elements' | 'budget' | 'cro' | 'themes'>('territory');
  const [audiences, setAudiences] = useState<any[]>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(false);
  const [addedAudiences, setAddedAudiences] = useState<Set<string>>(new Set());
  const [audienceToast, setAudienceToast] = useState<string | null>(null);
  const [territory, setTerritory] = useState<any>(null);
  const [competitors, setCompetitors] = useState<any>(null);
  const [competitorKeyword, setCompetitorKeyword] = useState('');

  // A/B Testing
  const [abTests, setAbTests] = useState<any[]>([]);
  const [abLoading, setAbLoading] = useState(false);
  const [newTest, setNewTest] = useState({ name: '', platform: 'google', goal: 'leads', variantA: '', variantB: '' });
  const [abRecommendation, setAbRecommendation] = useState<any>(null);
  const [abRecLoading, setAbRecLoading] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  // Creative Element Analytics
  const [elementAnalysis, setElementAnalysis] = useState<any>(null);
  const [elementLoading, setElementLoading] = useState(false);

  // Budget Shifting
  const [budgetRec, setBudgetRec] = useState<any>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [shiftConfirm, setShiftConfirm] = useState(false);

  // CRO Audit
  const [croAudit, setCroAudit] = useState<any>(null);
  const [croLoading, setCroLoading] = useState(false);

  // Creative Themes (G2)
  const [creativeThemes, setCreativeThemes] = useState<any>(null);
  const [themesLoading, setThemesLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      getTerritoryIntel(settings.geo_include ?? [], settings.website_url ?? '', settings.goal ?? 'leads').then(setTerritory);
    }
    getAbTests().then(r => setAbTests(r?.tests ?? []));
    setAbRecLoading(true);
    getAbTestRecommendation().then(r => { setAbRecommendation(r ?? null); setAbRecLoading(false); });
  }, [settings]);

  async function handleDiscoverAudiences() {
    setAudiencesLoading(true);
    const res = await discoverAudiences(settings, settings?.website_url ?? '');
    setAudiences(res?.audiences ?? []);
    setAudiencesLoading(false);
  }

  function handleAddAudience(id: string) {
    setAddedAudiences(prev => new Set([...prev, id]));
    const key = `vigmis_added_audiences`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
      localStorage.setItem(key, JSON.stringify([...new Set([...stored, id])]));
    } catch { /* localStorage unavailable */ }
    setAudienceToast('Audience segment saved — apply it in your next campaign brief');
    setTimeout(() => setAudienceToast(null), 3500);
  }

  async function handleCompetitors() {
    const res = await getCompetitors(competitorKeyword, territory?.detected_country);
    setCompetitors(res);
  }

  function handleUseRecommendation() {
    if (!abRecommendation) return;
    setNewTest({
      name: abRecommendation.name ?? '',
      platform: abRecommendation.platform ?? 'meta',
      goal: newTest.goal,
      variantA: abRecommendation.variant_a?.description ?? '',
      variantB: abRecommendation.variant_b?.description ?? '',
    });
    setShowManualForm(true);
  }

  async function handleCreateAbTest() {
    if (!newTest.variantA || !newTest.variantB) return;
    setAbLoading(true);
    const variants = [
      { name: 'Variant A', description: newTest.variantA },
      { name: 'Variant B', description: newTest.variantB },
    ];
    const res = await createAbTest(newTest.name || 'New A/B Test', variants, newTest.platform, newTest.goal);
    if (res?.id) setAbTests(prev => [res, ...prev]);
    setNewTest({ name: '', platform: 'google', goal: 'leads', variantA: '', variantB: '' });
    setShowManualForm(false);
    setAbLoading(false);
  }

  async function handleConcludeTest(id: string) {
    const res = await concludeAbTest(id);
    if (res?.conclusion) setAbTests(prev => prev.map(test => test.id === id ? { ...test, status: 'concluded', conclusion: res.conclusion } : test));
  }

  async function handleElementAnalysis() {
    if (!campaigns?.length) {
      alert('No performance data yet. Launch a campaign and approve creatives first.');
      return;
    }
    setElementLoading(true);
    const res = await analyzeCreativeElements(
      (campaigns ?? []).slice(0, 5).map((c: any) => ({
        id: c.id,
        type: c.campaign_type,
        description: c.name,
        metrics: { impressions: 0, clicks: 0, conversions: 0, spend: c.daily_budget_usd * 30 },
      })),
      'google',
      settings?.goal ?? 'leads',
    );
    setElementAnalysis(res?.analysis);
    setElementLoading(false);
  }

  async function handleBudgetRec() {
    setBudgetLoading(true);
    const res = await getBudgetShiftRecommendation();
    setBudgetRec(res);
    setBudgetLoading(false);
  }

  async function handleApplyShifts() {
    if (!budgetRec?.recommended_shifts?.length) return;
    setApplying(true);
    const shifts = budgetRec.recommended_shifts.map((s: any) => ({
      campaign_id: s.campaign_id,
      new_daily_budget_usd: s.recommended_budget,
    }));
    await applyBudgetShifts(shifts);
    setBudgetRec(null);
    setApplying(false);
  }

  async function handleCroAudit() {
    if (!settings?.website_url) return;
    setCroLoading(true);
    const res = await runCroAudit(settings.website_url, settings.goal ?? 'leads');
    setCroAudit(res);
    setCroLoading(false);
  }

  async function handleCreativeThemes() {
    setThemesLoading(true);
    const res = await getCreativeThemes();
    setCreativeThemes(res);
    setThemesLoading(false);
  }

  const SUB_TABS = [
    { key: 'territory', labelKey: 'tabs.subTerritory' },
    { key: 'audiences', labelKey: 'tabs.subAudiences' },
    { key: 'competitors', labelKey: 'tabs.subCompetitors' },
    { key: 'ab', labelKey: 'tabs.subAbTesting' },
    { key: 'elements', labelKey: 'tabs.subCreativeElements' },
    { key: 'themes', labelKey: 'tabs.subCreativeThemes' },
    { key: 'budget', labelKey: 'tabs.subBudgetShift' },
    { key: 'cro', labelKey: 'tabs.subCroAudit' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Sub-tab nav */}
      <div className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
        {SUB_TABS.map(st => (
          <button key={st.key} onClick={() => setSubTab(st.key)} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${subTab === st.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{t(st.labelKey)}</button>
        ))}
      </div>

      {/* Territory */}
      {subTab === 'territory' && !territory && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center space-y-2">
          <svg className="w-8 h-8 text-slate-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>
          <p className="text-sm font-semibold text-slate-700">Territory data loading…</p>
          <p className="text-xs text-slate-400">We detect your market from your campaign settings.</p>
        </div>
      )}
      {subTab === 'territory' && territory && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Territory Intelligence</h3>
            <span className="text-sm font-semibold text-indigo-600">{territory.detected_country} · {territory.currency?.symbol}{territory.currency?.code}</span>
          </div>
          <p className="text-xs text-slate-500 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 leading-relaxed">
            These geographic markets were identified from your strategy. Your campaign is already configured to target them.
          </p>
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
              {territory.localization_tips.map((tip: string, i: number) => <p key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-indigo-400">→</span>{tip}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Audience Discovery */}
      {subTab === 'audiences' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          {/* Toast */}
          {audienceToast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              {audienceToast}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Audience Discovery</h3>
              <p className="text-sm text-slate-500 mt-0.5">AI finds profitable segments you haven't tested yet</p>
            </div>
            <button onClick={handleDiscoverAudiences} disabled={audiencesLoading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {audiencesLoading ? 'Discovering...' : 'Discover Audiences'}
            </button>
          </div>
          {audiences.length === 0 && !audiencesLoading && (
            <div className="bg-slate-50 rounded-xl p-6 text-center space-y-1">
              <p className="text-sm font-semibold text-slate-600">{t('empty.noAudiences')}</p>
              <p className="text-xs text-slate-400">{t('empty.noAudiencesBody')}</p>
            </div>
          )}
          {audiences.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 leading-relaxed">
                These segments were identified based on your strategy and business profile. Add them to refine your campaign targeting.
              </p>
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
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex gap-1">
                        {(a.platforms ?? []).map((p: string) => <span key={p} className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${PLATFORM_BADGE[p] ?? 'bg-slate-100 text-slate-500'}`}>{p}</span>)}
                      </div>
                      {addedAudiences.has(a.id) ? (
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddAudience(a.id)}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 border border-indigo-200 hover:border-indigo-400 px-3 py-1 rounded-lg transition-colors"
                        >
                          Add to Campaign →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Competitive Intelligence */}
      {subTab === 'competitors' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-slate-900">Competitive Intelligence</h3>
            <p className="text-sm text-slate-500 mt-0.5">See what ads your competitors are running (Facebook Ad Library)</p>
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
          {competitors?.ads?.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">{competitors.total} ads found · source: Facebook Ad Library</p>
              {competitors.ads.map((ad: any) => (
                <div key={ad.id} className="border border-slate-200 rounded-xl p-4 space-y-2 hover:border-indigo-200 transition-colors">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900">{ad.page_name}</p>
                    {ad.ad_delivery_start_time && (
                      <span className="text-xs text-slate-400">Since {ad.ad_delivery_start_time.slice(0, 10)}</span>
                    )}
                  </div>
                  {ad.ad_creative_link_titles?.[0] && (
                    <p className="text-sm font-semibold text-indigo-700">{ad.ad_creative_link_titles[0]}</p>
                  )}
                  {ad.ad_creative_bodies?.[0] && (
                    <p className="text-sm text-slate-600 leading-relaxed">{ad.ad_creative_bodies[0].slice(0, 200)}{ad.ad_creative_bodies[0].length > 200 ? '...' : ''}</p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    {ad.impressions?.lower_bound && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                        {Number(ad.impressions.lower_bound).toLocaleString()}–{Number(ad.impressions.upper_bound).toLocaleString()} impressions
                      </span>
                    )}
                    {ad.ad_snapshot_url && (
                      <a href={ad.ad_snapshot_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">View Ad →</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* A/B Testing */}
      {subTab === 'ab' && (
        <div className="space-y-4">

          {/* Vigmis Recommendation Card */}
          {abRecLoading && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 animate-pulse">
              <div className="h-4 bg-amber-200 rounded w-48 mb-3" />
              <div className="h-3 bg-amber-100 rounded w-full mb-2" />
              <div className="h-3 bg-amber-100 rounded w-3/4" />
            </div>
          )}
          {!abRecLoading && abRecommendation && (
            <div className="bg-gradient-to-br from-amber-50 to-indigo-50 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">Vigmis recommends a test</p>
                  <h3 className="font-bold text-slate-900 text-base">{abRecommendation.name}</h3>
                  <span className="inline-block text-xs font-semibold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full capitalize">{abRecommendation.platform}</span>
                </div>
                <button
                  onClick={handleUseRecommendation}
                  className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors whitespace-nowrap"
                >
                  Use this recommendation →
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Variant A</p>
                  <p className="text-xs font-semibold text-slate-700">{abRecommendation.variant_a?.name}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{abRecommendation.variant_a?.description}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Variant B</p>
                  <p className="text-xs font-semibold text-slate-700">{abRecommendation.variant_b?.name}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{abRecommendation.variant_b?.description}</p>
                </div>
              </div>
              {abRecommendation.rationale && (
                <p className="text-xs text-slate-600 leading-relaxed border-t border-amber-100 pt-2">
                  <span className="font-semibold text-slate-700">Why: </span>{abRecommendation.rationale}
                </p>
              )}
              {abRecommendation.expected_outcome && (
                <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  <span className="font-semibold">Expected outcome: </span>{abRecommendation.expected_outcome}
                </p>
              )}
              <button
                onClick={() => setShowManualForm(v => !v)}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
              >
                {showManualForm ? '↑ hide manual form' : 'or create your own ↓'}
              </button>
            </div>
          )}

          {/* Manual Create Form — shown when no recommendation yet, or user clicked "or create your own" */}
          {(showManualForm || !abRecommendation) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900">Create A/B Test</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <input value={newTest.name} onChange={e => setNewTest(n => ({ ...n, name: e.target.value }))} placeholder="Test name (e.g. Hook style test)" className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <select value={newTest.platform} onChange={e => setNewTest(n => ({ ...n, platform: e.target.value }))} className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="google">Google</option><option value="meta">Meta</option><option value="tiktok">TikTok</option>
                </select>
              </div>
              <textarea value={newTest.variantA} onChange={e => setNewTest(n => ({ ...n, variantA: e.target.value }))} placeholder="Variant A — describe the ad creative or copy..." rows={2} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              <textarea value={newTest.variantB} onChange={e => setNewTest(n => ({ ...n, variantB: e.target.value }))} placeholder="Variant B — describe the alternative..." rows={2} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
              <button onClick={handleCreateAbTest} disabled={abLoading || !newTest.variantA || !newTest.variantB} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
                {abLoading ? 'Creating...' : 'Create Test'}
              </button>
            </div>
          )}

          {abTests.length === 0 && (
            <div className="bg-slate-50 rounded-xl p-6 text-center space-y-1">
              <p className="text-sm font-semibold text-slate-600">No A/B tests running</p>
              <p className="text-xs text-slate-400">Create your first test above — Vigmis will monitor CTR and declare a winner automatically.</p>
            </div>
          )}
          {abTests.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100"><p className="font-bold text-slate-900 text-sm">Active Tests</p></div>
              <div className="divide-y divide-slate-50">
                {abTests.map((test: any) => (
                  <div key={test.id} className="px-6 py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 text-sm">{test.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${test.status === 'running' ? 'bg-blue-100 text-blue-700' : test.status === 'concluded' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{test.status}</span>
                        {test.status === 'running' && <button onClick={() => handleConcludeTest(test.id)} className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold border border-indigo-200 px-3 py-1 rounded-lg">Conclude →</button>}
                      </div>
                    </div>
                    {test.conclusion && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs space-y-1">
                        <p className="font-bold text-emerald-800">Winner: {test.conclusion.winner_name} · {test.conclusion.ctr_lift} CTR lift</p>
                        <p className="text-emerald-700">{test.conclusion.key_reason}</p>
                        <p className="text-emerald-600">{test.conclusion.recommendation}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Creative Element Analytics */}
      {subTab === 'elements' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Creative Element Analytics</h3>
              <p className="text-sm text-slate-500 mt-0.5">What's working — hook, CTA, color, length, tone</p>
            </div>
            <button onClick={handleElementAnalysis} disabled={elementLoading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {elementLoading ? 'Analyzing...' : 'Analyze Elements'}
            </button>
          </div>
          {elementAnalysis && (
            <div className="space-y-4">
              {elementAnalysis.winning_formula && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">Winning Formula</p>
                  <p className="text-sm text-slate-800">{elementAnalysis.winning_formula}</p>
                </div>
              )}
              {elementAnalysis.element_scores && (
                <div className="grid grid-cols-5 gap-3">
                  {Object.entries(elementAnalysis.element_scores).map(([k, v]: [string, any]) => (
                    <div key={k} className={`rounded-xl p-3 text-center border ${v.verdict === 'strong' ? 'border-emerald-200 bg-emerald-50' : v.verdict === 'weak' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                      <p className={`text-2xl font-black ${v.verdict === 'strong' ? 'text-emerald-600' : v.verdict === 'weak' ? 'text-amber-500' : 'text-slate-400'}`}>{v.score}</p>
                      <p className="text-xs font-semibold text-slate-600 capitalize mt-0.5">{k.replace('_', ' ')}</p>
                      <p className="text-xs text-slate-400 mt-1 leading-tight">{v.tip}</p>
                    </div>
                  ))}
                </div>
              )}
              {elementAnalysis.top_performing_elements?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Top Performing Elements</p>
                  {elementAnalysis.top_performing_elements.map((e: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">{e.lift}</span>
                      <span className="text-sm text-slate-700 capitalize">{e.element.replace(/_/g, ' ')}: <strong>{e.value}</strong></span>
                    </div>
                  ))}
                </div>
              )}
              {elementAnalysis.next_test && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">Next Test to Run</p>
                  <p className="text-sm text-slate-700">{elementAnalysis.next_test}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Creative Themes (G2) */}
      {subTab === 'themes' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Creative Themes</h3>
              <p className="text-sm text-slate-500 mt-0.5">Patterns in your last 90 days of social posts — what's working and what to avoid</p>
            </div>
            <button
              onClick={handleCreativeThemes}
              disabled={themesLoading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              {themesLoading ? 'Analyzing...' : 'Analyze Themes'}
            </button>
          </div>

          {!creativeThemes && !themesLoading && (
            <div className="bg-slate-50 rounded-xl p-6 text-center space-y-1">
              <p className="text-sm font-semibold text-slate-600">{t('empty.noThemes')}</p>
              <p className="text-xs text-slate-400">{t('empty.noThemesBody')}</p>
            </div>
          )}

          {creativeThemes && (
            <div className="space-y-4">
              {creativeThemes.topPerforming && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Top Performing Pattern</p>
                  <p className="text-sm text-slate-800">{creativeThemes.topPerforming}</p>
                </div>
              )}
              {creativeThemes.toAvoid && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-1">Pattern to Avoid</p>
                  <p className="text-sm text-slate-800">{creativeThemes.toAvoid}</p>
                </div>
              )}
              {creativeThemes.insights?.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Theme Insights</p>
                  {creativeThemes.insights.map((ins: any, i: number) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-1 hover:border-indigo-200 transition-colors">
                      <p className="text-sm font-semibold text-slate-900">{ins.theme}</p>
                      <p className="text-xs text-slate-500">{ins.performance}</p>
                      <p className="text-xs text-indigo-600 font-medium">→ {ins.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Budget Shifting */}
      {subTab === 'budget' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Real-time Budget Shifting</h3>
              <p className="text-sm text-slate-500 mt-0.5">AI recommends how to reallocate budget to top performers</p>
            </div>
            <button onClick={handleBudgetRec} disabled={budgetLoading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {budgetLoading ? 'Analyzing...' : 'Get Recommendation'}
            </button>
          </div>
          {!budgetRec && !budgetLoading && campaigns?.length === 0 && (
            <p className="text-sm text-slate-400 py-2">Launch campaigns first — budget shifting works once you have active campaigns to compare.</p>
          )}
          {budgetRec && (
            <div className="space-y-4">
              {budgetRec.summary && <p className="text-sm text-slate-600 leading-relaxed">{budgetRec.summary}</p>}
              {budgetRec.expected_improvement && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-sm font-semibold text-emerald-800">Expected improvement: {budgetRec.expected_improvement}</p>
                </div>
              )}
              {budgetRec.recommended_shifts?.length > 0 && (
                <div className="space-y-2">
                  {budgetRec.recommended_shifts.map((s: any, i: number) => (
                    <div key={i} className="border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{s.campaign_name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{s.reason}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm text-slate-400 line-through">${s.current_budget}/day</p>
                        <p className={`text-sm font-bold ${s.change_pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>${s.recommended_budget}/day ({s.change_pct > 0 ? '+' : ''}{s.change_pct}%)</p>
                      </div>
                    </div>
                  ))}
                  {shiftConfirm ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-semibold text-amber-900">Apply all {budgetRec.recommended_shifts.length} budget changes now?</p>
                      <p className="text-xs text-amber-700">Changes take effect immediately on your ad platforms.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setShiftConfirm(false)} className="flex-1 border border-amber-300 text-amber-800 font-semibold py-2 rounded-xl text-sm hover:bg-amber-100 transition-colors">Cancel</button>
                        <button onClick={() => { setShiftConfirm(false); handleApplyShifts(); }} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-xl text-sm transition-colors">Apply Shifts</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShiftConfirm(true)} disabled={applying} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm transition-colors">
                      {applying ? 'Applying...' : 'Apply Budget Shifts →'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CRO Audit */}
      {subTab === 'cro' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">CRO Audit</h3>
              <p className="text-sm text-slate-500 mt-0.5">AI audits your landing page for conversion rate issues</p>
            </div>
            <button onClick={handleCroAudit} disabled={croLoading || !settings?.website_url} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
              {croLoading ? 'Auditing...' : `Audit ${settings?.website_url ? settings.website_url.replace('https://', '') : 'website'}`}
            </button>
          </div>
          {!settings?.website_url && <p className="text-sm text-slate-400">Complete onboarding with a website URL to run the audit.</p>}
          {croAudit && (
            <div className="space-y-5">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className={`text-5xl font-black ${croAudit.overall_score >= 80 ? 'text-emerald-600' : croAudit.overall_score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{croAudit.overall_score}</p>
                  <p className="text-xs text-slate-400 mt-0.5">CRO Score</p>
                </div>
                <div>
                  <p className={`text-3xl font-black ${croAudit.overall_score >= 80 ? 'text-emerald-600' : croAudit.overall_score >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{croAudit.grade}</p>
                  <p className="text-sm text-emerald-700 font-semibold mt-1">{croAudit.estimated_cvr_lift}</p>
                </div>
              </div>
              {croAudit.scores && (
                <div className="grid grid-cols-4 gap-2">
                  {Object.entries(croAudit.scores).map(([k, v]: [string, any]) => (
                    <div key={k} className="text-center bg-slate-50 rounded-xl p-2">
                      <p className={`text-lg font-bold ${v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-amber-500' : 'text-red-500'}`}>{v}</p>
                      <p className="text-xs text-slate-400 capitalize leading-tight">{k.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              )}
              {croAudit.quick_wins?.length > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">Quick Wins</p>
                  {croAudit.quick_wins.map((w: string, i: number) => <p key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-amber-500">→</span>{w}</p>)}
                </div>
              )}
              {croAudit.issues?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Issues Found</p>
                  {croAudit.issues.map((issue: any, i: number) => (
                    <div key={i} className={`border rounded-xl p-4 space-y-1 ${issue.severity === 'critical' ? 'border-red-200 bg-red-50' : issue.severity === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${issue.severity === 'critical' ? 'bg-red-200 text-red-700' : issue.severity === 'warning' ? 'bg-amber-200 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{issue.severity}</span>
                        <span className="text-sm font-semibold text-slate-900">{issue.element}</span>
                      </div>
                      <p className="text-xs text-slate-600">{issue.problem}</p>
                      <p className="text-xs font-semibold text-indigo-600">→ Fix: {issue.fix}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Protocols Tab — Decision Protocols full UI ────────────────────────────────

const PROTOCOL_TYPE_LABELS: Record<string, string> = {
  strategy_approval: 'Strategy Approval',
  budget_change: 'Budget Change',
  campaign_pause: 'Campaign Pause',
  campaign_resume: 'Campaign Resume',
  campaign_scale: 'Scale Recommendation',
  creative_refresh: 'Creative Refresh',
  targeting_review: 'Targeting Review',
  stagnation_alert: 'Performance Alert',
  general_advice: 'Vigmis Advice',
};

const PROTOCOL_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  in_discussion: 'bg-blue-100 text-blue-800',
  approved: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-slate-100 text-slate-500',
  expired: 'bg-red-100 text-red-600',
};

function ProtocolsTab() {
  const t = useTranslations('dashboard');
  const [protocols, setProtocols] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await getProtocols(statusFilter || undefined);
    setProtocols(res?.protocols ?? []);
    setLoading(false);
  }

  async function openProtocol(id: string) {
    const res = await getProtocol(id);
    setSelected(res);
    setReplyText('');
    setRejectReason('');
    setShowRejectInput(false);
    setMsg('');
  }

  async function handleReply() {
    if (!replyText.trim() || !selected) return;
    setReplying(true);
    const res = await replyToProtocol(selected.id, replyText);
    if (res) {
      setSelected((prev: any) => ({ ...prev, conversation: res.conversation, status: 'in_discussion' }));
      setProtocols(prev => prev.map(p => p.id === selected.id ? { ...p, status: 'in_discussion' } : p));
      setReplyText('');
    }
    setReplying(false);
  }

  async function handleApprove() {
    if (!selected) return;
    setActioning(true);
    const res = await approveProtocol(selected.id);
    if (res?.success) {
      setSelected((prev: any) => ({ ...prev, status: 'approved' }));
      setProtocols(prev => prev.map(p => p.id === selected.id ? { ...p, status: 'approved' } : p));
      setMsg('Approved. Action has been executed.');
    }
    setActioning(false);
  }

  async function handleReject() {
    if (!selected) return;
    setActioning(true);
    const res = await rejectProtocol(selected.id, rejectReason || undefined);
    if (res?.success) {
      setSelected((prev: any) => ({ ...prev, status: 'rejected' }));
      setProtocols(prev => prev.map(p => p.id === selected.id ? { ...p, status: 'rejected' } : p));
      setShowRejectInput(false);
      setMsg('Rejected.');
    }
    setActioning(false);
  }

  const pendingCount = protocols.filter(p => p.status === 'pending' || p.status === 'in_discussion').length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-slate-900 text-lg">Decision Protocols</h2>
          <p className="text-sm text-slate-500 mt-0.5">Every Vigmis recommendation, documented with full conversation and audit trail.</p>
        </div>
        {pendingCount > 0 && (
          <span className="bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
            {pendingCount} pending decision{pendingCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {['', 'pending', 'in_discussion', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setTimeout(load, 0); }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}
          >
            {s === '' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">{t('status.loading')}</p>
      ) : protocols.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-600">{t('empty.noProtocols')}</p>
          <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            When Vigmis takes an action on your behalf — pausing a campaign, shifting budget, concluding an A/B test — it documents every decision here with full reasoning.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Protocol list */}
          <div className="md:col-span-1 space-y-2">
            {protocols.map((p: any) => (
              <button
                key={p.id}
                onClick={() => openProtocol(p.id)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-colors ${selected?.id === p.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${PROTOCOL_STATUS_STYLES[p.status] ?? 'bg-slate-100 text-slate-500'}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">{p.title}</p>
                <p className="text-xs text-slate-400 mt-1">{PROTOCOL_TYPE_LABELS[p.type] ?? p.type} · {new Date(p.created_at).toLocaleDateString()}</p>
              </button>
            ))}
          </div>

          {/* Protocol detail */}
          <div className="md:col-span-2">
            {!selected ? (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center space-y-2">
                <svg className="w-8 h-8 text-slate-300 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                <p className="text-sm text-slate-400">Select a protocol from the list to view the full recommendation and discussion</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${PROTOCOL_STATUS_STYLES[selected.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {selected.status.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-400">{PROTOCOL_TYPE_LABELS[selected.type] ?? selected.type}</span>
                    {selected.platform && <span className="text-xs text-slate-400 capitalize">· {selected.platform}</span>}
                  </div>
                  <h3 className="font-bold text-slate-900">{selected.title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Created {new Date(selected.created_at).toLocaleString()} · Expires {new Date(selected.expires_at).toLocaleDateString()}</p>
                  {(selected.status === 'pending' || selected.status === 'in_discussion') && (new Date(selected.expires_at).getTime() - Date.now()) < 4 * 3600_000 && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-semibold">
                      ⚠ Expires in {Math.max(0, Math.round((new Date(selected.expires_at).getTime() - Date.now()) / 3600_000))}h — approve or reject now or this decision will be skipped.
                    </div>
                  )}
                </div>

                {/* Conversation thread */}
                <div className="px-5 py-4 space-y-4 max-h-80 overflow-y-auto">
                  {(selected.conversation ?? []).map((msg: any, i: number) => (
                    <div key={i} className={`flex ${msg.role === 'client' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === 'client'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        <p className={`text-xs font-semibold mb-1 ${msg.role === 'client' ? 'text-indigo-200' : 'text-slate-500'}`}>
                          {msg.role === 'vigmis' ? 'Vigmis' : 'You'}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <p className={`text-xs mt-1.5 ${msg.role === 'client' ? 'text-indigo-300' : 'text-slate-400'}`}>
                          {new Date(msg.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                {(selected.status === 'pending' || selected.status === 'in_discussion') && (
                  <div className="px-5 py-4 border-t border-slate-100 space-y-4">
                    {/* Reply */}
                    <div className="flex gap-2">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Ask a question or share your thoughts..."
                        rows={2}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                      <button
                        onClick={handleReply}
                        disabled={replying || !replyText.trim()}
                        className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold px-4 rounded-xl transition-colors"
                      >
                        {replying ? '...' : 'Send'}
                      </button>
                    </div>

                    {/* Formal approval */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-emerald-800">Formal approval</p>
                      <p className="text-sm text-emerald-900 italic">"{selected.approval_text}"</p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={handleApprove}
                          disabled={actioning}
                          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
                        >
                          {actioning ? 'Processing...' : 'Approve & Execute'}
                        </button>
                        {!showRejectInput ? (
                          <button
                            onClick={() => setShowRejectInput(true)}
                            className="border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                          >
                            Reject
                          </button>
                        ) : (
                          <div className="flex gap-2 w-full">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder="Reason (optional)"
                              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                            />
                            <button
                              onClick={handleReject}
                              disabled={actioning}
                              className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold px-4 rounded-xl transition-colors"
                            >
                              Confirm Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {msg && <p className={`text-sm font-medium ${msg.includes('Rejected') ? 'text-slate-500' : 'text-emerald-700'}`}>{msg}</p>}
                  </div>
                )}

                {(selected.status === 'approved' || selected.status === 'rejected') && (
                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                    <p className="text-xs text-slate-500">
                      {selected.status === 'approved' ? 'Approved' : 'Rejected'} on {selected.resolved_at ? new Date(selected.resolved_at).toLocaleString() : '—'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Strategy Tab ──────────────────────────────────────────────────────────────
// Read-only view of the current campaign strategy + the audit trail of changes.
// Lets the client see what Vigmis decided, on what basis, and what has changed since.

function ReadinessWidget() {
  const t = useTranslations('dashboard');
  const [readiness, setReadiness] = useState<Awaited<ReturnType<typeof getReadinessScore>> | null | 'not_found'>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [auditMsg, setAuditMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await getReadinessScore();
    setReadiness(res ?? 'not_found');
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleRecheck() {
    setAuditing(true);
    setAuditMsg(null);
    const res = await runReadinessAudit();
    if (res?.report) {
      setAuditMsg('Audit complete — score updated.');
      await load();
    } else {
      setAuditMsg('Audit failed. Make sure a website URL is set in your settings.');
    }
    setAuditing(false);
  }

  if (loading) return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-3 text-sm text-slate-500">
      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      Loading conversion readiness…
    </div>
  );

  if (readiness === 'not_found' || readiness === null) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-bold text-slate-900">Conversion Readiness</h3>
            <p className="text-sm text-slate-500 mt-1">{t('empty.noAudit')}</p>
          </div>
          <button
            onClick={handleRecheck}
            disabled={auditing}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {auditing ? 'Auditing…' : 'Re-check'}
          </button>
        </div>
        {auditMsg && <p className="text-xs text-slate-600 mt-2">{auditMsg}</p>}
      </div>
    );
  }

  const score = readiness.score ?? 0;
  const { colorClass, bgClass, borderClass, verdict } =
    score >= 71
      ? { colorClass: 'text-emerald-700', bgClass: 'bg-emerald-50', borderClass: 'border-emerald-200', verdict: 'Ready to advertise' }
      : score >= 41
      ? { colorClass: 'text-amber-700', bgClass: 'bg-amber-50', borderClass: 'border-amber-200', verdict: 'Some improvements needed' }
      : { colorClass: 'text-red-700', bgClass: 'bg-red-50', borderClass: 'border-red-200', verdict: 'Not ready for ads' };

  const issues: string[] = Array.isArray(readiness.report?.issues) ? readiness.report!.issues.slice(0, 3) : [];

  return (
    <div className={`border rounded-xl p-5 shadow-sm ${bgClass} ${borderClass}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className={`text-4xl font-black ${colorClass}`}>{score}</div>
            <div className="text-xs text-slate-500 mt-0.5">/ 100</div>
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Conversion Readiness</h3>
            <p className={`text-sm font-semibold mt-0.5 ${colorClass}`}>{verdict}</p>
            {readiness.evaluated_at && (
              <p className="text-xs text-slate-400 mt-0.5">Checked {new Date(readiness.evaluated_at).toLocaleDateString()}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleRecheck}
          disabled={auditing}
          className="text-sm border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {auditing ? 'Auditing…' : 'Re-check'}
        </button>
      </div>
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1">
          {issues.map((issue, i) => (
            <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
              <span className={`mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${score >= 71 ? 'bg-emerald-500' : score >= 41 ? 'bg-amber-500' : 'bg-red-500'}`} />
              {issue}
            </li>
          ))}
        </ul>
      )}
      {auditMsg && <p className="text-xs text-slate-600 mt-2">{auditMsg}</p>}
    </div>
  );
}

function StrategyTab({ settings: _settings }: any) {
  const t = useTranslations('dashboard');
  const [data, setData] = useState<Awaited<ReturnType<typeof getStrategy>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeMsg, setReanalyzeMsg] = useState<string | null>(null);

  // G3: Budget Scenario Modeling
  const [forecastBudget, setForecastBudget] = useState('');
  const [forecastResult, setForecastResult] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await getStrategy();
    setData(res);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleReanalyze() {
    setReanalyzing(true);
    setReanalyzeMsg(null);
    const res = await rerunAnalysisServer();
    if (!res) setReanalyzeMsg('Re-analysis failed. Try again from the chat.');
    else if (res.error) setReanalyzeMsg(res.error);
    else setReanalyzeMsg('Re-analyzed. Reload to see the new strategy.');
    setReanalyzing(false);
    await load();
  }

  async function handleForecast() {
    const budget = parseFloat(forecastBudget);
    if (!budget || isNaN(budget) || budget <= 0) return;
    setForecastLoading(true);
    const res = await getBudgetForecast(budget);
    setForecastResult(res);
    setForecastLoading(false);
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data?.settings) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center text-sm text-slate-500">
        {t('empty.noStrategy')}
      </div>
    );
  }

  const s = data.settings;
  const plan = s.strategy_plan ?? null;
  const managedBudget = s.budget_monthly_ils
    ? Math.round((s.budget_monthly_ils / 3.7) * (s.management_percentage / 100))
    : null;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <ReadinessWidget />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Current Strategy</h2>
          <p className="text-sm text-slate-500 mt-1">
            What Vigmis is doing, why, and every change since launch.
          </p>
          {s.updated_at && (
            <p className="text-xs text-slate-400 mt-0.5">Last updated: {new Date(s.updated_at).toLocaleString()}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            {reanalyzing ? 'Re-analyzing site…' : 'Re-analyze website'}
          </button>
          <a href="/onboarding?rethink=true" className="text-sm border border-amber-200 text-amber-700 hover:bg-amber-50 px-4 py-2 rounded-xl transition-colors">
            Rethink strategy
          </a>
        </div>
      </div>

      {reanalyzeMsg && (
        <p className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700">{reanalyzeMsg}</p>
      )}

      {/* Website understanding */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">What Vigmis understood about your business</h3>
          {s.website_url && (
            <a href={s.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
              {s.website_url} →
            </a>
          )}
        </div>
        {s.website_analysis ? (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap" dir="ltr">{s.website_analysis}</p>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            No website analysis was stored. Click "Re-analyze website" to scan now — Vigmis will refuse to invent if the site is unreadable.
          </p>
        )}
      </div>

      {/* Plan summary */}
      {plan && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Campaign plan</h3>
            {managedBudget !== null && (
              <span className="text-sm font-bold text-indigo-600">${managedBudget}/mo managed</span>
            )}
          </div>
          <div className="p-5 space-y-4 text-sm text-slate-700">
            {plan.market_insights && (
              <div dir="ltr" className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Market insights</p>
                <p className="leading-relaxed">{plan.market_insights}</p>
              </div>
            )}
            {plan.target_audience && (
              <div dir="ltr" className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Target audience</p>
                <p className="leading-relaxed">{plan.target_audience}</p>
              </div>
            )}
            {plan.platforms?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Platforms & budget split</p>
                <div className="space-y-2">
                  {plan.platforms.map((p: any) => (
                    <div key={p.name} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <div>
                        <span className="font-semibold capitalize">{p.name}</span>
                        {p.campaign_types && (
                          <span className="text-xs text-slate-500 ml-2">({p.campaign_types.join(', ')})</span>
                        )}
                        {p.reasoning && (
                          <p className="text-xs text-slate-500 mt-0.5">{p.reasoning}</p>
                        )}
                      </div>
                      <span className="text-sm font-bold text-slate-900 flex-shrink-0">{p.budget_percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {plan.estimated_cpc && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Estimated CPC</span>
                <strong>{plan.estimated_cpc}</strong>
              </div>
            )}
            {plan.recommendations && (
              <div dir="ltr" className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Recommendations</p>
                <p className="leading-relaxed whitespace-pre-wrap">{plan.recommendations}</p>
              </div>
            )}
            {plan.confidence_scores && (
              <div dir="ltr" className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Confidence</p>
                <div className="space-y-2">
                  {(['icp', 'channel', 'budget', 'overall'] as const).map((key) => {
                    const score = Number((plan.confidence_scores as any)?.[key]);
                    if (!Number.isFinite(score)) return null;
                    const note = (plan.confidence_notes as any)?.[key] as string | undefined;
                    const barColor = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500';
                    const labelColor = score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-amber-700' : 'text-rose-700';
                    const label = key === 'icp' ? 'ICP' : key.charAt(0).toUpperCase() + key.slice(1);
                    return (
                      <div key={key} title={note || undefined} className={note ? 'cursor-help' : ''}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-semibold text-slate-600">
                            {label}
                            {note && <span className="ml-1 text-slate-300">ⓘ</span>}
                          </span>
                          <span className={`text-xs font-bold ${labelColor}`}>{score}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
                        </div>
                        {note && <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{note}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {plan.budget_split_rationale && (
              <div dir="ltr" className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Why this budget split</p>
                <p className="leading-relaxed">{plan.budget_split_rationale}</p>
              </div>
            )}
            {Array.isArray(plan.risk_factors) && plan.risk_factors.length > 0 && (
              <details className="group rounded-lg border border-rose-100 bg-rose-50/50">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-rose-700 uppercase tracking-wider">
                  Risks & Mitigations ({plan.risk_factors.length})
                </summary>
                <div dir="ltr" className="px-3 pb-3 space-y-2.5 text-left">
                  {plan.risk_factors.map((r: any, i: number) => {
                    const sev = (lvl: string) =>
                      lvl === 'high' ? 'bg-rose-100 text-rose-700'
                        : lvl === 'medium' ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600';
                    return (
                      <div key={i} className="bg-white border border-rose-100 rounded-lg p-2.5">
                        <p className="font-semibold text-slate-800">{r.risk}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sev(r.probability)}`}>P: {r.probability}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${sev(r.impact)}`}>Impact: {r.impact}</span>
                        </div>
                        {r.mitigation && <p className="text-xs text-slate-600 mt-1.5"><span className="font-semibold text-slate-700">Mitigation:</span> {r.mitigation}</p>}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
            {plan.counter_argument && (
              <details className="group rounded-lg border border-indigo-100 bg-indigo-50/40">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Why not the alternatives?
                </summary>
                <p dir="ltr" className="px-3 pb-3 text-left text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{plan.counter_argument}</p>
              </details>
            )}
            {Array.isArray(plan.what_we_dont_know) && plan.what_we_dont_know.length > 0 && (
              <details className="group rounded-lg border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Assumptions & unknowns
                </summary>
                <ul dir="ltr" className="px-3 pb-3 text-left list-disc list-inside space-y-1 text-xs text-slate-600">
                  {plan.what_we_dont_know.map((u: string, i: number) => <li key={i}>{u}</li>)}
                </ul>
              </details>
            )}
            {plan.icp_confidence_gap && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <span className="text-amber-500 text-base leading-none mt-0.5">&#9888;</span>
                <p className="text-xs text-amber-800 leading-relaxed">
                  <span className="font-semibold">To improve accuracy: </span>{plan.icp_confidence_gap}
                </p>
              </div>
            )}
            {Array.isArray(plan.cited_stats) && plan.cited_stats.length > 0 && (
              <details className="group rounded-lg border border-slate-200 bg-slate-50">
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Sources ({plan.cited_stats.length})
                </summary>
                <div dir="ltr" className="px-3 pb-3 space-y-2 text-left">
                  {plan.cited_stats.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${s.confidence === 'high' ? 'bg-emerald-400' : 'bg-amber-400'}`} title={s.confidence === 'high' ? 'High confidence' : 'Medium confidence'} />
                      <div>
                        <span className="text-slate-700">{s.claim}</span>
                        <span className="text-slate-400 ml-1">— {s.source}</span>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400 pt-1">Green dot = high confidence, amber = medium confidence</p>
                </div>
              </details>
            )}
            {plan.custom_benchmarks && (
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer font-semibold">Custom benchmarks (what counts as good vs bad for this business)</summary>
                <pre className="mt-2 bg-slate-50 rounded-lg p-2 overflow-x-auto text-[10px]">{JSON.stringify(plan.custom_benchmarks, null, 2)}</pre>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Inputs we used */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-3">Inputs Vigmis used</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-slate-400">Goal</dt><dd className="font-medium">{s.goal}</dd></div>
          <div><dt className="text-xs text-slate-400">Business type</dt><dd className="font-medium">{s.business_type ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-400">Monthly budget</dt><dd className="font-medium">₪{s.budget_monthly_ils?.toLocaleString() ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-400">Managed share</dt><dd className="font-medium">{s.management_percentage}%</dd></div>
          <div><dt className="text-xs text-slate-400">Margin</dt><dd className="font-medium">{s.margin_pct ? `${s.margin_pct}%` : '—'}</dd></div>
          <div><dt className="text-xs text-slate-400">Hero product</dt><dd className="font-medium">{s.hero_product_name ?? '—'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Targeting include</dt><dd className="font-medium">{(s.geo_include ?? []).join(', ') || '—'}</dd></div>
          {s.geo_exclude?.length > 0 && <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Excluded</dt><dd className="font-medium">{s.geo_exclude.join(', ')}</dd></div>}
          {s.exclusions && <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Hard exclusions</dt><dd className="font-medium whitespace-pre-wrap">{s.exclusions}</dd></div>}
          {s.open_notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Notes</dt><dd className="font-medium whitespace-pre-wrap">{s.open_notes}</dd></div>}
        </dl>
      </div>

      {/* G3: Budget Scenario Modeling */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-slate-900">Budget Scenarios</h3>
          <p className="text-sm text-slate-500 mt-0.5">What-if forecasts based on your ROAS history</p>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
            <input
              type="number"
              min={1}
              value={forecastBudget}
              onChange={e => setForecastBudget(e.target.value)}
              placeholder="Monthly ad budget"
              className="w-full border border-slate-200 rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleForecast}
            disabled={forecastLoading || !forecastBudget}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            {forecastLoading ? 'Forecasting...' : 'Run forecast'}
          </button>
        </div>

        {forecastResult && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Based on {forecastResult.basedOn}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider py-2 pr-4">Budget</th>
                    <th className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider py-2 px-2">Est. Leads</th>
                    <th className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider py-2 px-2">Est. Revenue</th>
                    <th className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider py-2 px-2">ROAS</th>
                    <th className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider py-2 pl-2">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {forecastResult.scenarios?.map((s: any, i: number) => (
                    <tr key={i} className={i === 1 ? 'bg-indigo-50' : ''}>
                      <td className="py-2.5 pr-4">
                        <span className="font-semibold text-slate-900">${s.budgetUsd.toLocaleString()}</span>
                        <span className="text-xs text-slate-400 ml-2">{s.note}</span>
                      </td>
                      <td className="text-right py-2.5 px-2 font-medium text-slate-700">{s.estimatedLeads.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-2 font-medium text-slate-700">${s.estimatedRevenue.toLocaleString()}</td>
                      <td className="text-right py-2.5 px-2 font-bold text-slate-900">{s.estimatedRoas}x</td>
                      <td className="text-right py-2.5 pl-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' : s.confidence === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {s.confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Change history */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-3">{t('buttons.changeHistory')}</h3>
        {data.history.length === 0 ? (
          <p className="text-sm text-slate-500">{t('empty.noOptimizationChanges')}</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {data.history.map(h => (
              <li key={h.id} className="border-l-2 border-slate-200 pl-3 py-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-slate-800">{h.action.replace(/^optimization\./, '').replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{new Date(h.created_at).toLocaleString()}</span>
                </div>
                {h.platform && <span className="text-xs text-slate-500 capitalize">{h.platform}</span>}
                {h.payload && Object.keys(h.payload).length > 0 && (
                  <details className="mt-1 text-xs text-slate-500">
                    <summary className="cursor-pointer">details</summary>
                    <pre className="mt-1 bg-slate-50 rounded p-2 overflow-x-auto text-[10px]">{JSON.stringify(h.payload, null, 2)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Brand Asset Library ───────────────────────────────────────────────────────
// Shows all images/videos uploaded by the user + AI-generated creatives.
// Used in Settings tab and as a picker in Social posts.

function BrandAssetLibrary() {
  const t = useTranslations('dashboard');
  const [assets, setAssets] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | 'image' | 'video'>('all');

  async function load() {
    setLoading(true);
    const res = await getBrandAssets(kindFilter === 'all' ? undefined : kindFilter);
    setAssets(res?.assets ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [kindFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(file: File) {
    setUploading(true);
    const res = await uploadBrandAsset(file);
    setUploading(false);
    if (res) await load();
    else alert('Upload failed. Check file type and size (max 10 MB).');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this asset? This cannot be undone.')) return;
    setDeleting(id);
    await deleteBrandAsset(id);
    setAssets(prev => prev?.filter(a => a.id !== id) ?? null);
    setDeleting(null);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-bold text-slate-900 text-lg">Brand Asset Library</h2>
          <p className="text-xs text-slate-500 mt-0.5">Upload logos, product images, and videos for use in posts and campaigns.</p>
        </div>
        <label className={`flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          {uploading ? 'Uploading...' : 'Upload'}
          <input type="file" accept="image/*,video/mp4,video/quicktime" className="hidden" disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
        </label>
      </div>

      <div className="flex gap-1.5">
        {(['all', 'image', 'video'] as const).map(k => (
          <button key={k} onClick={() => setKindFilter(k)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors capitalize ${kindFilter === k ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
            {k}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : assets && assets.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-400">
          {t('empty.noAssets')}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {assets?.map(asset => (
            <div key={asset.id} className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              {asset.kind === 'image' ? (
                <img src={asset.public_url} alt={asset.filename} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-1">
                <a href={asset.public_url} target="_blank" rel="noopener noreferrer" className="text-[10px] bg-white text-slate-900 font-semibold px-2 py-1 rounded-lg w-full text-center">View</a>
                <button onClick={() => handleDelete(asset.id)} disabled={deleting === asset.id}
                  className="text-[10px] bg-red-500 hover:bg-red-600 text-white font-semibold px-2 py-1 rounded-lg w-full transition-colors disabled:opacity-50">
                  {deleting === asset.id ? '...' : 'Delete'}
                </button>
              </div>
              <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1.5 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">{asset.filename}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab({ settings, connected }: any) {
  const t = useTranslations('dashboard');
  const [alertEmail, setAlertEmail] = useState('');
  const [alertWhatsApp, setAlertWhatsApp] = useState('');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [alertLoading, setAlertLoading] = useState(true);
  const [alertSaving, setAlertSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');

  // Optimization
  const [riskLevel, setRiskLevel] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');
  const [optLoading, setOptLoading] = useState(true);
  const [optSaving, setOptSaving] = useState(false);
  const [optRunning, setOptRunning] = useState(false);
  const [optResult, setOptResult] = useState<any>(null);
  const [optHistory, setOptHistory] = useState<any[]>([]);
  const [optMsg, setOptMsg] = useState('');
  const [approvals, setApprovals] = useState<any[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);

  // Danger zone
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    getAlertSettings().then(data => {
      if (data) {
        setAlertEmail(data.email ?? '');
        setAlertWhatsApp(data.whatsapp ?? '');
        setEmailEnabled(data.email_enabled ?? false);
        setWhatsappEnabled(data.whatsapp_enabled ?? false);
      }
      setAlertLoading(false);
    });
    Promise.all([getOptimizationSettings(), getOptimizationHistory(), getApprovalRequests()]).then(([s, h, a]) => {
      if (s) setRiskLevel(s.risk_level ?? 'moderate');
      setOptHistory(h?.entries ?? []);
      setApprovals(a?.requests ?? []);
      setOptLoading(false);
    });
  }, []);

  async function handleSaveAlerts() {
    setAlertSaving(true);
    setAlertMsg('');
    try {
      const res = await saveAlertSettings({
        email: alertEmail,
        whatsapp: alertWhatsApp,
        email_enabled: emailEnabled,
        whatsapp_enabled: whatsappEnabled,
      });
      const channels = res?.active_channels ?? [];
      setAlertMsg(channels.length ? `Active on: ${channels.join(', ')}` : 'Saved. No channels enabled yet.');
    } catch {
      setAlertMsg('Save failed.');
    } finally {
      setAlertSaving(false);
    }
  }

  async function handleTestAlert() {
    if (!emailEnabled && !whatsappEnabled) {
      setAlertMsg('Enable at least one channel before sending a test.');
      return;
    }
    setTestSending(true);
    setAlertMsg('');
    try {
      await sendTestAlert();
      setAlertMsg('Test alert sent!');
    } catch {
      setAlertMsg('Failed to send test alert.');
    } finally {
      setTestSending(false);
    }
  }

  async function handleSaveOptimization() {
    setOptSaving(true); setOptMsg('');
    try {
      await saveOptimizationSettings({ risk_level: riskLevel });
      setOptMsg(riskLevel === 'conservative' ? 'Manual mode saved — changes need your approval.' : `Auto mode saved (${riskLevel}).`);
    } catch {
      setOptMsg('Save failed.');
    } finally {
      setOptSaving(false);
    }
  }

  async function handleRunNow() {
    setOptRunning(true); setOptMsg(''); setOptResult(null);
    try {
      const res = await runOptimizationNow();
      setOptResult(res);
      const h = await getOptimizationHistory();
      setOptHistory(h?.entries ?? []);
      setOptMsg(`Done — ${res?.actionsApplied ?? 0} action(s) applied, ${res?.approvalsPending ?? 0} pending approval.`);
    } catch {
      setOptMsg('Run failed.');
    } finally {
      setOptRunning(false);
    }
  }

  async function handleApprove(id: string) {
    setApprovalsLoading(true);
    await approveRequest(id);
    setApprovals(prev => prev.filter(a => a.id !== id));
    setApprovalsLoading(false);
  }

  async function handleReject(id: string) {
    setApprovalsLoading(true);
    await rejectRequest(id);
    setApprovals(prev => prev.filter(a => a.id !== id));
    setApprovalsLoading(false);
  }

  const RISK_OPTIONS = [
    {
      value: 'conservative',
      label: 'Manual — I approve every change',
      desc: 'Vigmis sends you a decision protocol for each change. Campaign runs unchanged until you approve. Recommended only if you check the dashboard daily.',
    },
    {
      value: 'moderate',
      label: 'Auto (Recommended)',
      desc: 'Vigmis applies safe, data-driven optimizations automatically. Every action is documented and you can review the full log anytime.',
    },
    {
      value: 'aggressive',
      label: 'Auto (Aggressive)',
      desc: 'Vigmis moves faster — larger budget swings, quicker scaling decisions. Higher upside potential with higher variance.',
    },
  ] as const;

  const ACTION_LABELS: Record<string, string> = {
    pause: 'Paused campaign',
    resume: 'Resumed campaign',
    scale_up: 'Scaled up budget',
    scale_down: 'Scaled down budget',
    needs_creative: 'Flagged creative fatigue',
    creative_fatigue: 'Creative fatigue detected',
    no_action: 'No action',
  };

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
          <div className="pt-3 flex gap-2 border-t border-slate-100">
            <a href="/onboarding" className="flex-1 text-center text-sm text-indigo-600 hover:text-indigo-700 font-semibold">Edit Settings →</a>
            <a href="/onboarding?rethink=true" className="flex-1 text-center text-sm text-amber-600 hover:text-amber-700 font-semibold">Rethink Strategy →</a>
          </div>
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

      {/* Optimization Mode */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900">Optimization Mode</h3>
            <p className="text-sm text-slate-500 mt-0.5">Control how the AI manages your campaigns</p>
          </div>
          <button
            onClick={handleRunNow}
            disabled={optRunning}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {optRunning ? 'Running...' : 'Run Now'}
          </button>
        </div>

        {optLoading ? <p className="text-sm text-slate-400">{t('status.loading')}</p> : (
          <div className="space-y-2">
            {RISK_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setRiskLevel(opt.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-colors ${riskLevel === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <p className={`text-sm font-semibold ${riskLevel === opt.value ? 'text-indigo-700' : 'text-slate-800'}`}>{opt.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        )}

        {riskLevel === 'conservative' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1.5">
            <p className="font-semibold text-sm">Important: manual mode has a cost</p>
            <p>When Vigmis detects a needed change (e.g. a campaign is burning budget with low results), it will create a pending protocol and wait for your approval. <strong>Until you approve, the campaign continues at current settings.</strong></p>
            <p>This works well if you log in daily. If you're less available, Auto mode gives better results — every action is still logged and you can see the full audit trail at any time.</p>
          </div>
        )}

        <button onClick={handleSaveOptimization} disabled={optSaving || optLoading} className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
          {optSaving ? 'Saving...' : 'Save Mode'}
        </button>

        {optMsg && <p className={`text-sm font-medium ${optMsg.includes('failed') ? 'text-red-600' : 'text-indigo-600'}`}>{optMsg}</p>}

        {/* Optimization history */}
        {optHistory.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recent Optimization Actions</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {optHistory.map((entry: any) => (
                <div key={entry.id} className="flex items-center gap-3 py-1.5 text-sm border-b border-slate-50 last:border-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${
                    entry.action === 'pause' ? 'bg-amber-100 text-amber-700' :
                    entry.action === 'resume' ? 'bg-emerald-100 text-emerald-700' :
                    entry.action === 'scale_up' ? 'bg-blue-100 text-blue-700' :
                    entry.action === 'scale_down' ? 'bg-red-100 text-red-700' :
                    entry.action === 'needs_creative' || entry.action === 'creative_fatigue' ? 'bg-purple-100 text-purple-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                  {entry.campaign_name && <span className="text-slate-600 truncate">{entry.campaign_name}</span>}
                  {entry.reason && <span className="text-slate-400 text-xs truncate hidden md:block">{entry.reason}</span>}
                  <span className="text-xs text-slate-300 flex-shrink-0 ml-auto">{new Date(entry.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {optResult && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-1">
            <p className="font-semibold text-slate-800">Last run results</p>
            <p className="text-slate-600">{optResult.campaignsEvaluated} campaigns evaluated</p>
            <p className="text-slate-600">{optResult.actionsApplied} actions applied</p>
            {optResult.approvalsPending > 0 && <p className="text-amber-600">{optResult.approvalsPending} pending your approval</p>}
            {optResult.errors?.length > 0 && <p className="text-red-600">{optResult.errors.length} errors</p>}
          </div>
        )}
      </div>

      {/* Pending Approvals (conservative mode) */}
      {approvals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <h3 className="font-bold text-amber-900">{approvals.length} Pending Approval{approvals.length > 1 ? 's' : ''}</h3>
          </div>
          <div className="space-y-3">
            {approvals.map((req: any) => (
              <div key={req.id} className="bg-white border border-amber-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      req.action_type === 'scale_up' ? 'bg-blue-100 text-blue-700' :
                      req.action_type === 'scale_down' ? 'bg-red-100 text-red-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>{ACTION_LABELS[req.action_type] ?? req.action_type}</span>
                    {req.campaign_name && <span className="text-sm font-semibold text-slate-900 ml-2">{req.campaign_name}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReject(req.id)}
                      disabled={approvalsLoading}
                      className="text-xs border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >Reject</button>
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={approvalsLoading}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >Approve</button>
                  </div>
                </div>
                {req.reason && <p className="text-xs text-slate-500">{req.reason}</p>}
                {req.factor && <p className="text-xs text-slate-400">Budget factor: ×{req.factor}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-1">Alert Channels</h3>
        <p className="text-sm text-slate-500 mb-5">Get notified via email or WhatsApp when campaigns need attention</p>
        {alertLoading ? (
          <p className="text-sm text-slate-400">{t('status.loading')}</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">Email alerts</label>
                <button
                  onClick={() => setEmailEnabled(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${emailEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${emailEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <input
                type="email"
                placeholder="your@email.com"
                value={alertEmail}
                onChange={e => setAlertEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">WhatsApp alerts</label>
                <button
                  onClick={() => setWhatsappEnabled(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${whatsappEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${whatsappEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <input
                type="tel"
                placeholder="+972501234567"
                value={alertWhatsApp}
                onChange={e => setAlertWhatsApp(e.target.value)}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${alertWhatsApp && !/^\+\d{7,15}$/.test(alertWhatsApp) ? 'border-red-300 focus:ring-red-300' : 'border-slate-200 focus:ring-indigo-400'}`}
              />
              <p className={`text-xs ${alertWhatsApp && !/^\+\d{7,15}$/.test(alertWhatsApp) ? 'text-red-500' : 'text-slate-400'}`}>
                {alertWhatsApp && !/^\+\d{7,15}$/.test(alertWhatsApp) ? 'Must start with + and country code (e.g. +972501234567)' : 'Include country code (e.g. +972 for Israel)'}
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSaveAlerts}
                disabled={alertSaving || (whatsappEnabled && !!alertWhatsApp && !/^\+\d{7,15}$/.test(alertWhatsApp))}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
              >
                {alertSaving ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                onClick={handleTestAlert}
                disabled={testSending}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
              >
                {testSending ? 'Sending...' : 'Send Test Alert'}
              </button>
            </div>

            {alertMsg && (
              <p className="text-sm text-indigo-600 font-medium">{alertMsg}</p>
            )}
          </div>
        )}
      </div>

      {/* Brand Asset Library */}
      <BrandAssetLibrary />

      {/* Danger Zone */}
      <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
        <h2 className="font-bold text-red-700 text-lg mb-1">Danger Zone</h2>
        <p className="text-xs text-slate-500 mb-5">These actions are irreversible. Please read carefully before proceeding.</p>

        <div className="space-y-4">
          {/* Export */}
          <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100">
            <div>
              <p className="text-sm font-semibold text-slate-800">Export my data</p>
              <p className="text-xs text-slate-500">Download all your campaign data, settings, and history as JSON.</p>
            </div>
            <button
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const { url, token } = await getExportUrl();
                  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                  const blob = await res.blob();
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `vigmis-export-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                } finally {
                  setExporting(false);
                }
              }}
              className="flex-shrink-0 text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-700 transition-colors disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export Data'}
            </button>
          </div>

            {/* Cancel subscription */}
          <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100">
            <div>
              <p className="text-sm font-semibold text-slate-800">Cancel subscription</p>
              <p className="text-xs text-slate-500">Manage or cancel your billing plan. Your account and data stay intact.</p>
            </div>
            <a
              href="/billing"
              className="flex-shrink-0 text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 hover:border-slate-300 text-slate-700 transition-colors"
            >
              Manage Billing
            </a>
          </div>

          {/* Delete */}
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-semibold text-red-700">Delete my account</p>
              <p className="text-xs text-slate-500">All campaigns are paused and your account is permanently deleted immediately. This cannot be undone.</p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex-shrink-0 text-sm font-semibold px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h3 className="font-bold text-slate-900 text-lg mb-2">Delete your account?</h3>
              <p className="text-sm text-slate-600 mb-3">
                All campaigns will be paused immediately. Your account data will be permanently and irreversibly deleted. This action <strong>cannot be undone</strong>.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4 flex items-start gap-2">
                <span className="text-amber-500 font-bold text-sm mt-0.5">↓</span>
                <p className="text-xs text-amber-800">
                  Consider <button onClick={async () => { setExporting(true); try { const { url, token } = await getExportUrl(); const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `vigmis-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); } finally { setExporting(false); } }} className="font-semibold underline underline-offset-2 cursor-pointer">{exporting ? 'downloading...' : 'downloading your data'}</button> before deleting — campaigns, settings, and history as JSON.
                </p>
              </div>
              <p className="text-xs text-slate-500 mb-2">Type <strong>DELETE</strong> to confirm:</p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  onClick={async () => {
                    setDeleting(true);
                    const result = await deleteAccount();
                    if (result?.payment_required && result.checkout_url) {
                      window.location.href = result.checkout_url;
                    } else {
                      router.push('/sign-in?deleted=1');
                    }
                  }}
                  className="flex-1 text-sm font-semibold px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                >
                  {deleting ? 'Processing...' : 'Yes, delete my account'}
                </button>
              </div>
            </div>
          </div>
        )}
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

// ── Social Tab ─────────────────────────────────────────────────────────────────

const SOCIAL_STATUS_STYLES: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  published: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-500',
};

const PLATFORM_SOCIAL_BADGE: Record<string, string> = {
  facebook: 'bg-blue-50 text-blue-700',
  instagram: 'bg-pink-50 text-pink-700',
  tiktok: 'bg-slate-100 text-slate-700',
};

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-700',
  question: 'bg-blue-100 text-blue-700',
  complaint: 'bg-red-100 text-red-700',
  spam: 'bg-slate-100 text-slate-500',
  other: 'bg-slate-100 text-slate-500',
};

// ── GEO Tab ───────────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning:  'bg-amber-50 border-amber-200 text-amber-700',
  info:     'bg-blue-50 border-blue-200 text-blue-700',
};
const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-blue-400',
};
const PRIORITY_STYLE: Record<string, string> = {
  critical: 'text-red-600 font-bold', high: 'text-amber-600 font-semibold', medium: 'text-slate-500',
};

function GradeCircle({ score, grade, delta }: { score: number; grade: string; delta?: number | null }) {
  const color = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-500' : 'text-red-500';
  const ring  = score >= 80 ? 'border-emerald-400' : score >= 60 ? 'border-amber-400' : 'border-red-400';
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-24 h-24 rounded-full border-4 ${ring} flex flex-col items-center justify-center flex-shrink-0`}>
        <span className={`text-3xl font-black ${color}`}>{grade}</span>
        <span className="text-xs text-slate-400">{score}/100</span>
      </div>
      {delta !== null && delta !== undefined && (
        <span className={`text-xs font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {delta >= 0 ? '↑' : '↓'}{Math.abs(delta)} from last month
        </span>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={copy} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
      {copied ? 'Copied!' : label}
    </button>
  );
}

function GeoTab({ settings }: any) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [auditError, setAuditError] = useState(false);
  const [activeSection, setActiveSection] = useState<'issues' | 'schema' | 'faq' | 'description' | 'checklist'>('issues');
  const [valuePropDismissed, setValuePropDismissed] = useState(false);

  useEffect(() => {
    getGeoReport().then(async r => {
      if (r?.exists) {
        setReport(r);
        setLoading(false);
      } else if (!settings?.website_url) {
        setLoading(false);
      } else {
        // No report yet — Vigmis runs the audit automatically
        setLoading(false);
        setRefreshing(true);
        try {
          const fresh = await runGeoAudit();
          setReport(fresh);
        } catch { setAuditError(true); }
        finally { setRefreshing(false); }
      }
    });
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const r = await runGeoAudit();
      setReport(r);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Value prop banner */}
      {!valuePropDismissed && (
        <div className="flex items-start justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5">
          <p className="text-sm text-amber-800 leading-relaxed">
            When someone asks ChatGPT &ldquo;who provides [your service] in [your city]?&rdquo; — will they find you? Your current score predicts the answer.
          </p>
          <button
            onClick={() => setValuePropDismissed(true)}
            className="text-amber-500 hover:text-amber-700 flex-shrink-0 mt-0.5 text-lg leading-none"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-slate-900">AI Visibility Report</h2>
            <p className="text-sm text-slate-500 mt-1">
              Vigmis analyzes how well AI systems — ChatGPT, Claude, Gemini — can find and recommend your business.
              {report?.website_url && <span className="ml-1 text-slate-400">· {report.website_url}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {report && <GradeCircle score={report.score ?? 0} grade={report.grade ?? 'F'} delta={report.score_delta ?? null} />}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs font-semibold text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-2 rounded-xl transition-colors disabled:opacity-40"
            >
              {refreshing ? 'Analyzing…' : 'Refresh'}
            </button>
          </div>
        </div>
        {refreshing && (
          <div className="mt-4 flex items-center gap-3 text-sm text-slate-500 bg-indigo-50 rounded-xl px-4 py-3">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            Vigmis is scanning your website and generating your AI visibility report… (~30 seconds)
          </div>
        )}
      </div>

      {!report && !refreshing && (
        <div className={`border rounded-2xl p-10 text-center ${auditError ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
          <p className="text-slate-500 text-sm">
            {!settings?.website_url
              ? 'Add your website URL in Settings — Vigmis will generate the AI visibility report automatically.'
              : auditError
                ? 'Could not generate the AI visibility report. Click Refresh to try again.'
                : 'Report is being generated. Refresh the page in a moment.'}
          </p>
        </div>
      )}

      {report && (
        <>
          {/* Score breakdown + strengths */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Issues found ({(report.issues ?? []).length})</h3>
              <div className="space-y-1">
                {(['critical', 'warning', 'info'] as const).map(sev => {
                  const count = (report.issues ?? []).filter((i: any) => i.severity === sev).length;
                  return count > 0 ? (
                    <div key={sev} className="flex items-center gap-2 text-sm">
                      <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_DOT[sev]}`} />
                      <span className="capitalize text-slate-600">{sev}</span>
                      <span className="ml-auto font-bold text-slate-800">{count}</span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Strengths</h3>
              <ul className="space-y-1.5">
                {(report.strengths ?? []).slice(0, 4).map((s: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                    {s}
                  </li>
                ))}
                {!(report.strengths?.length) && <li className="text-sm text-slate-400 italic">None identified yet — run the audit to see results.</li>}
              </ul>
            </div>
          </div>

          {/* Section tabs */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-200 overflow-x-auto">
              {([
                { key: 'issues', label: 'Issues & Fixes' },
                { key: 'schema', label: 'Schema Code' },
                { key: 'faq', label: 'FAQ Content' },
                { key: 'description', label: 'Business Description' },
                { key: 'checklist', label: 'Action Checklist' },
              ] as const).map(s => (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    activeSection === s.key ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* Issues */}
              {activeSection === 'issues' && (
                <div className="space-y-3">
                  {(report.issues ?? []).length === 0 && <p className="text-sm text-slate-400 italic">No issues found — great work!</p>}
                  {(report.issues ?? []).map((issue: any, i: number) => (
                    <div key={i} className={`border rounded-xl p-4 ${SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.info}`}>
                      <div className="flex items-start gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${SEVERITY_DOT[issue.severity] ?? SEVERITY_DOT.info}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold uppercase tracking-wide opacity-70">{issue.element}</span>
                            <span className="text-xs font-semibold uppercase tracking-wide bg-white/60 px-2 py-0.5 rounded-full">{issue.severity}</span>
                          </div>
                          <p className="text-sm font-semibold mt-1">{issue.problem}</p>
                          <p className="text-sm mt-1 opacity-80"><span className="font-semibold">Fix:</span> {issue.fix}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Schema Code */}
              {activeSection === 'schema' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">JSON-LD Schema.org code</p>
                      <p className="text-xs text-slate-400 mt-0.5">Paste this inside a &lt;script type="application/ld+json"&gt; tag in your website &lt;head&gt;</p>
                    </div>
                    <CopyButton text={report.schema_code ?? ''} label="Copy code" />
                  </div>
                  <pre className="bg-slate-900 text-emerald-300 text-xs p-4 rounded-xl overflow-x-auto leading-relaxed whitespace-pre-wrap">
                    {report.schema_code
                      ? JSON.stringify(JSON.parse(report.schema_code), null, 2)
                      : 'No schema generated'}
                  </pre>
                </div>
              )}

              {/* FAQ */}
              {activeSection === 'faq' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">FAQ content for your website</p>
                      <p className="text-xs text-slate-400 mt-0.5">Add these Q&As to your website FAQ section — AI systems will use them to answer customer questions</p>
                    </div>
                    {(report.faq ?? []).length > 0 && (
                      <CopyButton
                        text={(report.faq ?? []).map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}
                        label="Copy all"
                      />
                    )}
                  </div>
                  {(report.faq ?? []).length === 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
                      <p className="text-sm text-slate-500 font-medium">No FAQ content generated yet</p>
                      <p className="text-xs text-slate-400 mt-1.5">We couldn&apos;t fully scan your website for AI optimization. To generate your FAQ: add your website URL in the field above and click Refresh Audit.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(report.faq ?? []).map((f: any, i: number) => (
                        <div key={i} className="border border-slate-200 rounded-xl p-4">
                          <p className="text-sm font-semibold text-slate-800">Q: {f.question}</p>
                          <p className="text-sm text-slate-600 mt-1.5">A: {f.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Business Description */}
              {activeSection === 'description' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">AI-optimized business description</p>
                      <p className="text-xs text-slate-400 mt-0.5">Use this on Google Business Profile, directory listings, and your About page</p>
                    </div>
                    <CopyButton text={report.business_description ?? ''} label="Copy text" />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                    <p className="text-sm text-slate-700 leading-relaxed">{report.business_description}</p>
                  </div>
                </div>
              )}

              {/* Checklist */}
              {activeSection === 'checklist' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-700 mb-3">Manual actions you need to take</p>
                  {(report.checklist ?? []).map((item: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 border border-slate-200 rounded-xl p-3.5">
                      <input type="checkbox" className="mt-0.5 w-4 h-4 accent-indigo-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-slate-700">{item.item}</p>
                        <span className={`text-xs mt-0.5 ${PRIORITY_STYLE[item.priority] ?? 'text-slate-400'}`}>
                          {item.priority} priority
                        </span>
                      </div>
                      {item.url && (
                        item.url === 'https://schema.org' ? (
                          <button
                            onClick={() => setActiveSection('schema')}
                            className="text-xs text-indigo-600 hover:underline whitespace-nowrap"
                          >
                            View Schema →
                          </button>
                        ) : (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline whitespace-nowrap">
                            Open →
                          </a>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center">
            Last audit: {new Date(report.updated_at || report.created_at).toLocaleString()} · {report.website_url}
          </p>
        </>
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const t = useTranslations('dashboard');
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getHistoryTimeline().then(r => { setTimeline(r?.timeline ?? []); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!timeline.length) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
      <p className="text-slate-400 text-sm">{t('empty.noHistory')}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Account History</h2>
          <p className="text-sm text-slate-500 mt-0.5">Monthly snapshots of your account — performance, AI visibility, and all actions Vigmis took</p>
        </div>
      </div>

      <div className="space-y-3">
        {timeline.map((month: any) => {
          const isOpen = expanded === month.snapshot_month;
          const geo = month.geo;
          const highlights: any[] = (month.highlights ?? []).slice(0, 8);

          const actionGroups: Record<string, number> = {};
          for (const h of month.highlights ?? []) {
            const key = h.action?.split('.')[0] ?? 'other';
            actionGroups[key] = (actionGroups[key] ?? 0) + 1;
          }

          return (
            <div key={month.snapshot_month} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Month header */}
              <button
                onClick={() => setExpanded(isOpen ? null : month.snapshot_month)}
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="w-14 text-center flex-shrink-0">
                  <p className="text-xs font-bold text-slate-400 uppercase">{month.snapshot_month?.slice(0, 4)}</p>
                  <p className="text-lg font-black text-slate-800">
                    {new Date(month.snapshot_month + '-01').toLocaleDateString('en-US', { month: 'short' })}
                  </p>
                </div>

                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* GEO score */}
                  {geo && (
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-xs text-slate-400 font-medium">AI Score</p>
                      <p className={`text-lg font-black ${(geo.score ?? 0) >= 80 ? 'text-emerald-600' : (geo.score ?? 0) >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                        {geo.grade ?? 'N/A'}
                      </p>
                      {geo.score_delta !== null && geo.score_delta !== undefined && (
                        <p className={`text-xs font-bold ${geo.score_delta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                          {geo.score_delta >= 0 ? '+' : ''}{geo.score_delta}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Campaigns */}
                  {month.active_campaigns !== undefined && (
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-xs text-slate-400 font-medium">Campaigns</p>
                      <p className="text-lg font-black text-slate-800">{month.active_campaigns}</p>
                      <p className="text-xs text-slate-400">active</p>
                    </div>
                  )}
                  {/* Optimizations */}
                  {month.optimizations_count !== undefined && (
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-xs text-slate-400 font-medium">AI Actions</p>
                      <p className="text-lg font-black text-indigo-600">{(month.optimizations_count ?? 0) + (month.budget_changes_count ?? 0)}</p>
                      <p className="text-xs text-slate-400">total</p>
                    </div>
                  )}
                  {/* Events count */}
                  <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                    <p className="text-xs text-slate-400 font-medium">Events</p>
                    <p className="text-lg font-black text-slate-800">{(month.highlights ?? []).length}</p>
                    <p className="text-xs text-slate-400">logged</p>
                  </div>
                </div>

                <svg className={`w-5 h-5 text-slate-300 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-4">
                  {/* Action groups summary */}
                  {Object.keys(actionGroups).length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Actions by type</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(actionGroups).map(([key, count]) => (
                          <span key={key} className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">
                            {key} × {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Last 8 highlights */}
                  {highlights.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Recent events</p>
                      <div className="space-y-1.5">
                        {highlights.map((h: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 text-sm">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${h.actor === 'ai' ? 'bg-indigo-400' : 'bg-slate-400'}`} />
                            <span className="text-slate-600">{h.action?.replace(/\./g, ' › ')}</span>
                            <span className="ml-auto text-xs text-slate-400">{new Date(h.created_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Market notes if present */}
                  {month.market_notes && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Market notes</p>
                      <p className="text-sm text-amber-800">{month.market_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PostActions — inline edit / reschedule / delete for any non-published post.
// Sits under each row in the posts list so the client can fix typos, push a
// date, or remove a draft without leaving the page.
function PostActions({ post, onChange }: { post: any; onChange: () => Promise<void> | void }) {
  const [mode, setMode] = useState<'idle' | 'edit' | 'reschedule' | 'delete' | 'image'>('idle');
  const [text, setText] = useState(post.client_edit || post.content || '');
  const [when, setWhen] = useState(post.scheduled_for ? new Date(post.scheduled_for).toISOString().slice(0, 16) : '');
  const [img, setImg] = useState(post.image_url || '');
  const [busy, setBusy] = useState(false);

  async function save(fields: { content?: string; image_url?: string | null; scheduled_for?: string }) {
    setBusy(true);
    await updateSocialPost(post.id, fields);
    setBusy(false);
    setMode('idle');
    await onChange();
  }
  async function doDelete() {
    setBusy(true);
    await deleteSocialPost(post.id);
    setBusy(false);
    await onChange();
  }

  if (post.status === 'published') {
    return (
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => { if (confirm('Remove this post from Vigmis? (it stays live on Facebook/Instagram unless you delete it there too)')) doDelete(); }}
          disabled={busy}
          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded"
        >
          Remove from Vigmis
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {mode === 'idle' && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMode('edit')} className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-slate-700">Edit text</button>
          <button onClick={() => setMode('image')} className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-slate-700">{post.image_url ? 'Change image' : 'Add image'}</button>
          <button onClick={() => setMode('reschedule')} className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-slate-700">Reschedule</button>
          <button
            onClick={() => { if (confirm('Delete this post permanently?')) doDelete(); }}
            disabled={busy}
            className="text-xs border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg"
          >
            Delete
          </button>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2"
          />
          <div className="flex gap-2">
            <button onClick={() => setMode('idle')} className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg">Cancel</button>
            <button onClick={() => save({ content: text })} disabled={busy || !text.trim()} className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">Save text</button>
          </div>
        </div>
      )}

      {mode === 'image' && (
        <div className="space-y-2">
          <input
            type="url"
            value={img}
            onChange={e => setImg(e.target.value)}
            placeholder="https://..."
            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2"
          />
          <p className="text-xs text-slate-400">Paste a public image URL. Image upload is coming — for now use a URL from your site or any image host.</p>
          <div className="flex gap-2">
            <button onClick={() => setMode('idle')} className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg">Cancel</button>
            {post.image_url && (
              <button onClick={() => save({ image_url: null })} disabled={busy} className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg">Remove image</button>
            )}
            <button onClick={() => save({ image_url: img })} disabled={busy || !img.trim()} className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">Save image</button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="datetime-local"
            value={when}
            onChange={e => setWhen(e.target.value)}
            className="text-sm border border-slate-200 rounded-xl px-3 py-1.5"
          />
          <button onClick={() => setMode('idle')} className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg">Cancel</button>
          <button
            onClick={() => save({ scheduled_for: new Date(when).toISOString() })}
            disabled={busy || !when}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg"
          >
            Save new time
          </button>
        </div>
      )}
    </div>
  );
}

function SocialTab({ metaConnected, googleConnected }: { metaConnected: boolean; googleConnected: boolean }) {
  const t = useTranslations('dashboard');
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<any[]>([]);
  const [settings, setSocialSettings] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [generatingPost, setGeneratingPost] = useState<string | null>(null);
  const [rejectingPost, setRejectingPost] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [editPost, setEditPost] = useState<{ id: string; content: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lastGenerateSkipped, setLastGenerateSkipped] = useState(0);
  // Creative brief dialog state for social post generation
  const [socialBriefOpen, setSocialBriefOpen] = useState(false);
  const [socialBriefData, setSocialBriefData] = useState<CreativeBriefData | null>(null);
  const [editReply, setEditReply] = useState<{ id: string; text: string } | null>(null);
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'posts' | 'comments' | 'connect'>('posts');
  const [savingConnect, setSavingConnect] = useState(false);
  const [pageIdInput, setPageIdInput] = useState('');
  const [igUserIdInput, setIgUserIdInput] = useState('');
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[] | null>(null);
  const [adAccountSelected, setAdAccountSelected] = useState<string | null>(null);
  const [adAccountLoading, setAdAccountLoading] = useState(false);
  const [adAccountSaving, setAdAccountSaving] = useState(false);
  const [adAccountError, setAdAccountError] = useState<string | null>(null);

  // ── Meta Pages + Instagram picker ─────────────────────────────────────────
  const [pages, setPages] = useState<MetaPage[] | null>(null);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedIgUserId, setSelectedIgUserId] = useState<string | null>(null);
  const [pageSaving, setPageSaving] = useState(false);

  async function loadPages() {
    setPagesLoading(true);
    setPagesError(null);
    const res = await getMetaPages();
    if (!res) {
      setPages([]);
      setPagesError('Could not load Facebook pages. Reconnect Meta and try again.');
    } else {
      setPages(res.pages);
      setSelectedPageId(res.selected_page_id);
      setSelectedIgUserId(res.selected_instagram_user_id);
    }
    setPagesLoading(false);
  }

  async function handleSelectPage(p: MetaPage) {
    setPageSaving(true);
    const res = await selectMetaPage(p.page_id, p.instagram_user_id);
    if (res) {
      setSelectedPageId(p.page_id);
      setSelectedIgUserId(p.instagram_user_id);
      await load(); // refresh settings so the rest of SocialTab sees the new IDs
    } else {
      setPagesError('Failed to save selection.');
    }
    setPageSaving(false);
  }

  async function loadAdAccounts() {
    setAdAccountLoading(true);
    setAdAccountError(null);
    const res = await getMetaAdAccounts();
    if (!res) {
      setAdAccounts([]);
      setAdAccountError('Could not load ad accounts — make sure Meta is connected and re-try.');
    } else {
      setAdAccounts(res.accounts);
      setAdAccountSelected(res.selected);
    }
    setAdAccountLoading(false);
  }

  const [editing, setEditing] = useState<null | 'page' | 'account' | 'ga4' | 'google_account'>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Media picker for posts ─────────────────────────────────────────────────
  const [mediaPickerPost, setMediaPickerPost] = useState<string | null>(null);
  const [brandAssets, setBrandAssets] = useState<any[] | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [postImageOverrides, setPostImageOverrides] = useState<Record<string, string | null>>({});

  async function loadBrandAssets() {
    const res = await getBrandAssets('image');
    setBrandAssets(res?.assets ?? []);
  }

  function openMediaPicker(postId: string) {
    setMediaPickerPost(postId);
    if (!brandAssets) loadBrandAssets();
  }

  async function handleSetPostImage(postId: string, url: string | null) {
    await updateSocialPost(postId, { image_url: url });
    setPostImageOverrides(prev => ({ ...prev, [postId]: url }));
    setMediaPickerPost(null);
    await load();
  }

  async function handleUploadForPost(postId: string, file: File) {
    setUploadingMedia(true);
    const res = await uploadBrandAsset(file);
    setUploadingMedia(false);
    if (res?.public_url) {
      await handleSetPostImage(postId, res.public_url);
      setBrandAssets(prev => prev ? [{ id: res.id, public_url: res.public_url, filename: file.name, kind: 'image' }, ...prev] : null);
    }
  }

  async function handleGenerateImageForPost(postId: string) {
    setGeneratingImage(true);
    const res = await generatePostImage(postId);
    setGeneratingImage(false);
    if (res?.image_url) {
      setPostImageOverrides(prev => ({ ...prev, [postId]: res.image_url }));
      setMediaPickerPost(null);
      await load();
    } else {
      alert('Image generation failed. Check that OpenAI API is configured.');
    }
  }

  // Google Ads account selector state
  const [googleAccounts, setGoogleAccounts] = useState<{ id: string; name: string; status?: string }[] | null>(null);
  const [googleAccountSelected, setGoogleAccountSelected] = useState<string | null>(null);
  const [googleAccountLoading, setGoogleAccountLoading] = useState(false);
  const [googleAccountError, setGoogleAccountError] = useState<string | null>(null);
  const [googleAccountSaving, setGoogleAccountSaving] = useState(false);

  async function handleConnectMeta() {
    const tok = await (window as any).Clerk?.session?.getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    window.location.href = `${apiUrl}/auth/meta?token=${encodeURIComponent(tok ?? '')}`;
  }

  async function handleConnectGoogleAds() {
    const tok = await (window as any).Clerk?.session?.getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    window.location.href = `${apiUrl}/auth/google?token=${encodeURIComponent(tok ?? '')}`;
  }

  async function handleConnectGoogleAnalytics() {
    const tok = await (window as any).Clerk?.session?.getToken();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    window.location.href = `${apiUrl}/auth/google/analytics?token=${encodeURIComponent(tok ?? '')}`;
  }

  async function loadGoogleAccounts() {
    setGoogleAccountLoading(true);
    setGoogleAccountError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const tok = await (window as any).Clerk?.session?.getToken();
      const res = await fetch(`${apiUrl}/connectors/google/accounts`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setGoogleAccounts(data.accounts);
      setGoogleAccountSelected(data.selected);
    } catch {
      setGoogleAccountError('Could not load Google Ads accounts — make sure Google is connected.');
    }
    setGoogleAccountLoading(false);
  }

  async function handleSelectGoogleAccount(id: string) {
    setGoogleAccountSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const tok = await (window as any).Clerk?.session?.getToken();
      await fetch(`${apiUrl}/connectors/google/select-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id }),
      });
      setGoogleAccountSelected(id);
      setEditing(null);
    } catch {
      setGoogleAccountError('Failed to save selection — try again.');
    }
    setGoogleAccountSaving(false);
  }

  async function handleDisconnectMeta() {
    if (!confirm('Disconnect Facebook from Vigmis? You can reconnect anytime.')) return;
    setDisconnecting(true);
    await disconnectMeta();
    await load();
    setEditing(null);
    setPages(null);
    setAdAccounts(null);
    setDisconnecting(false);
  }

  async function handleSelectAdAccount(id: string) {
    setAdAccountSaving(true);
    const res = await selectMetaAdAccount(id);
    if (res?.success) setAdAccountSelected(id);
    else setAdAccountError('Failed to save selection — try again.');
    setAdAccountSaving(false);
  }

  // ── GA4 (Google Analytics 4) ────────────────────────────────────────────────
  const [ga4Settings, setGa4Settings] = useState<{ property_id: string; property_name?: string; last_synced_at?: string } | null>(null);
  const [ga4Properties, setGa4Properties] = useState<Ga4Property[] | null>(null);
  const [ga4Loading, setGa4Loading] = useState(false);
  const [ga4Saving, setGa4Saving] = useState(false);
  const [ga4Syncing, setGa4Syncing] = useState(false);
  const [ga4Error, setGa4Error] = useState<string | null>(null);
  const [ga4Status, setGa4Status] = useState<string | null>(null);

  async function loadGa4() {
    setGa4Loading(true);
    setGa4Error(null);
    const [propsRes, settingsRes] = await Promise.all([getGa4Properties(), getGa4Settings()]);
    if (!propsRes) setGa4Error('Could not load GA4 properties — reconnect Google with the analytics.readonly scope.');
    else setGa4Properties(propsRes.properties);
    setGa4Settings(settingsRes?.settings ?? null);
    setGa4Loading(false);
  }

  async function handleSelectGa4(p: Ga4Property) {
    setGa4Saving(true);
    const res = await setGa4Property(p.property_id, p.display_name);
    if (res) setGa4Settings({ property_id: p.property_id, property_name: p.display_name });
    else setGa4Error('Failed to save GA4 property.');
    setGa4Saving(false);
  }

  async function handleGa4Sync() {
    setGa4Syncing(true);
    setGa4Status(null);
    const r = await runGa4Sync();
    if (!r) setGa4Error('Sync failed — check that the property is reachable.');
    else setGa4Status(`Pulled ${r.rows} rows${r.from ? ` from ${r.from} to ${r.to}` : ''}.`);
    setGa4Syncing(false);
  }

  async function load() {
    setLoading(true);
    const [postsRes, settingsRes, analyticsRes, commentsRes] = await Promise.all([
      getSocialPosts(filterStatus ? { status: filterStatus } : undefined),
      getSocialSettings(),
      getSocialAnalytics(),
      getSocialComments({ status: 'pending_approval' }),
    ]);
    const s = settingsRes?.settings ?? null;
    setPosts(postsRes?.posts ?? []);
    setSocialSettings(s);
    setAnalytics(analyticsRes ?? null);
    setComments(commentsRes?.comments ?? []);
    setPageIdInput(s?.facebook_page_id ?? '');
    setIgUserIdInput(s?.instagram_user_id ?? '');
    setLoading(false);
  }

  useEffect(() => { load(); }, [filterStatus]);

  // Auto-open Connect section + Google account selector after Google OAuth redirect
  useEffect(() => {
    if (searchParams?.get('connected') === 'google') {
      setActiveSection('connect');
      setTimeout(() => {
        setEditing('google_account');
        loadGoogleAccounts();
      }, 400);
    }
  }, []);

  // Reconnect modal — shown when publish fails because Meta token is stale/insufficient
  const [reconnectModal, setReconnectModal] = useState<{ open: boolean; rawError: string }>({ open: false, rawError: '' });

  // Three approve modes: publish now, schedule custom time, or keep weekly slot.
  async function handleApprove(id: string, mode: 'now' | 'custom' | 'keep', customWhen?: string) {
    setGeneratingPost(id);
    const editContent = editPost?.id === id ? editPost.content : undefined;
    const opts: { editedContent?: string; publishNow?: boolean; scheduledFor?: string } = {
      editedContent: editContent,
    };
    if (mode === 'now') opts.publishNow = true;
    else if (mode === 'custom' && customWhen) opts.scheduledFor = customWhen;
    const res = await approveSocialPost(id, opts);
    setEditPost(null);
    setScheduleFor(null);
    await load();
    setGeneratingPost(null);
    if (mode === 'now') {
      if (res?.published) {
        alert('Post published successfully.');
      } else {
        const err = res?.publishError ?? '';
        // Any Meta API permission-style error → show the reconnect modal instead of a noisy alert.
        const isPermission = /pages_manage_posts|publish_to_groups|permission|#100|#200|#10|scope|not allowed/i.test(err);
        if (isPermission) setReconnectModal({ open: true, rawError: err });
        else alert('Publish failed: ' + (err || 'unknown error') + '\nThe post stays in pending state.');
      }
    }
  }
  const [scheduleFor, setScheduleFor] = useState<{ id: string; value: string } | null>(null);

  async function handleReject(id: string) {
    await rejectSocialPost(id, rejectReason);
    setRejectingPost(null);
    setRejectReason('');
    await load();
  }

  // Open the brief dialog before generating social posts
  function handleGenerate() {
    setSocialBriefOpen(true);
  }

  async function runGenerateSocialContent(brief: CreativeBriefData | null, force = false) {
    setSocialBriefData(brief);
    setGenerating(true);
    setLastGenerateSkipped(0);
    const result = await generateSocialContent(brief, force);
    await load();
    setGenerating(false);
    if (!result) {
      alert('Generation failed. Check that Meta is connected and try again.');
    } else if (result.generated === 0 && result.skipped === 0) {
      alert('Social media is not configured. Enable it first.');
    } else if (result.generated === 0 && result.skipped > 0) {
      setLastGenerateSkipped(result.skipped);
    } else {
      setLastGenerateSkipped(0);
      alert(`Generated ${result.generated} post${result.generated > 1 ? 's' : ''}.`);
    }
  }

  async function handleSendReply(commentId: string) {
    const text = editReply?.id === commentId ? editReply.text : comments.find(c => c.id === commentId)?.ai_draft_reply;
    if (!text?.trim()) return;
    setSendingReply(commentId);
    await sendSocialCommentReply(commentId, text.trim());
    setEditReply(null);
    const res = await getSocialComments({ status: 'pending_approval' });
    setComments(res?.comments ?? []);
    setSendingReply(null);
  }

  async function handleIgnore(commentId: string) {
    await ignoreSocialComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  async function handleHide(commentId: string) {
    await hideSocialComment(commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  async function handleSaveConnect() {
    setSavingConnect(true);
    const res = await updateSocialSettings({
      facebook_page_id: pageIdInput.trim() || null,
      instagram_user_id: igUserIdInput.trim() || null,
    });
    await load();
    setSavingConnect(false);
    if (!res) {
      alert('Save failed — please check that Meta is still connected and try again.');
    } else {
      alert(`Saved.\nFacebook Page: ${pageIdInput.trim() || '(none)'}\nInstagram: ${igUserIdInput.trim() || '(none)'}`);
    }
  }

  const pendingPosts = posts.filter(p => p.status === 'pending_approval' && !p.content?.includes('INSUFFICIENT_CONTENT'));
  const brokenPosts = posts.filter(p => p.status === 'pending_approval' && p.content?.includes('INSUFFICIENT_CONTENT'));
  const coolingOffPosts = posts.filter(p => p.status === 'cooling_off' && !p.cooling_off_cancelled);

  async function handleCancelCoolingOff(postId: string) {
    await cancelCoolingOff(postId);
    await load();
  }

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!settings) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-14 h-14 bg-violet-100 rounded-2xl flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Enable Social Media</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          Vigmis will create weekly content for your Facebook Page and Instagram. You approve before anything is published.
        </p>
        <button
          onClick={async () => {
            await updateSocialSettings({
              enabled: true,
              approval_mode: 'review',
              platforms: [
                { platform: 'facebook', enabled: true, posts_per_week: 1 },
                { platform: 'instagram', enabled: true, posts_per_week: 1 },
              ],
              content_pillars: ['educational', 'promotional', 'social_proof'],
            });
            await load();
          }}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg shadow-sm"
        >
          Enable Social Media Management
        </button>
        <p className="text-xs text-slate-400">Requires Meta connection. You can disable it later in settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Creative Brief Dialog for social post generation */}
      <CreativeBriefDialog
        open={socialBriefOpen}
        onClose={() => setSocialBriefOpen(false)}
        onProceed={async (data) => { setSocialBriefOpen(false); await runGenerateSocialContent(data); }}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Social Media</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {settings.approval_mode === 'auto' ? 'Auto-publish mode' : settings.approval_mode === 'strict' ? 'Manual approval required' : '24h review window'} ·{' '}
            {(settings.platforms as any[]).filter(p => p.enabled !== false).map((p: any) => p.platform).join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu items={[
            { label: '⬇ Download CSV (Excel)', action: async () => { const r = await exportSocialCSV(); if (r) downloadCSV(r.content, 'vigmis-social.csv'); } },
            { label: '🖨 Export PDF Report', action: async () => { const r = await exportSocialHTML(); if (r) openPrintWindow(r.content); } },
          ]} />
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
          >
            {generating ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />Generating...</>
            ) : (
              <>+ Generate this week's posts</>
            )}
          </button>
        </div>
      </div>

      {/* Skipped banner */}
      {lastGenerateSkipped > 0 && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
          <span className="text-amber-800 font-medium">
            {lastGenerateSkipped} platform{lastGenerateSkipped > 1 ? 's' : ''} skipped — already scheduled this week.
          </span>
          <button
            onClick={() => runGenerateSocialContent(socialBriefData, true)}
            disabled={generating}
            className="shrink-0 text-amber-700 font-semibold underline underline-offset-2 hover:text-amber-900 disabled:opacity-50 transition-colors"
          >
            Generate anyway →
          </button>
        </div>
      )}

      {/* Section toggle */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveSection('posts')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeSection === 'posts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Posts {pendingPosts.length > 0 && <span className="ml-1 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{pendingPosts.length}</span>}
        </button>
        <button
          onClick={() => setActiveSection('comments')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeSection === 'comments' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Comments {comments.length > 0 && <span className="ml-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">{comments.length}</span>}
        </button>
        <button
          onClick={() => setActiveSection('connect')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${activeSection === 'connect' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Connect {(!settings?.facebook_page_id && !settings?.instagram_user_id) && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">!</span>}
        </button>
      </div>

      {/* Posts section */}
      {activeSection === 'posts' && (
      <div className="space-y-6">

      {/* Connection-aware informational banner */}
      {metaConnected && !googleConnected && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
          <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Publishing to Facebook &amp; Instagram. Connect Google Ads to manage paid campaigns too.
          </span>
        </div>
      )}

      {/* Cooling-off banner — visible during 1-hour high-stakes delay */}
      {coolingOffPosts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-700 font-bold">⏳ Cooling-off in progress</span>
            <span className="text-xs text-amber-600">High-stakes content auto-publishes after 1 hour. Cancel here if you change your mind.</span>
          </div>
          {coolingOffPosts.map(p => {
            const remainingMs = p.cooling_off_until ? new Date(p.cooling_off_until).getTime() - Date.now() : 0;
            const minsLeft = Math.max(0, Math.round(remainingMs / 60_000));
            return (
              <div key={p.id} className="bg-white rounded-xl p-3 flex items-start gap-3 border border-amber-100">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 mb-0.5"><span className="capitalize">{p.platform}</span> · publishes in {minsLeft} min</p>
                  <p className="text-sm text-slate-700 truncate"><bdi>{p.client_edit || p.content}</bdi></p>
                  {Array.isArray(p.cooling_off_labels) && p.cooling_off_labels.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {p.cooling_off_labels.map((l: string) => (
                        <span key={l} className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">{l}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleCancelCoolingOff(p.id)}
                  className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold px-3 py-1.5 rounded-lg"
                >
                  Cancel publish
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Analytics summary */}
      {analytics?.summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 font-medium mb-1">Published</p>
            <p className="text-2xl font-bold text-slate-900">{analytics.summary.totalPublished}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 font-medium mb-1">Total Reach</p>
            <p className="text-2xl font-bold text-violet-600">{analytics.summary.totalReach.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 font-medium mb-1">Spend This Month</p>
            <p className="text-2xl font-bold text-slate-900">${analytics.summary.totalSpendUsd.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Failed generation — posts where AI had insufficient content */}
      {brokenPosts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-red-200 flex items-center justify-between">
            <p className="text-sm font-bold text-red-800">
              {brokenPosts.length} post{brokenPosts.length !== 1 ? 's' : ''} failed to generate
            </p>
            <button
              onClick={async () => { await Promise.all(brokenPosts.map(p => deleteSocialPost(p.id))); await load(); }}
              className="text-xs text-red-600 font-semibold hover:text-red-800"
            >
              Delete all
            </button>
          </div>
          <div className="px-5 py-3 text-sm text-red-700 space-y-1">
            <p>Vigmis could not find enough information about your business to generate posts.</p>
            <p className="text-xs text-red-500">Delete these and click "Generate this week's posts" again after making sure your website has product/service details.</p>
          </div>
        </div>
      )}

      {/* Approval queue */}
      {pendingPosts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-200">
            <p className="text-sm font-bold text-amber-800">{pendingPosts.length} post{pendingPosts.length !== 1 ? 's' : ''} awaiting your approval</p>
          </div>
          <div className="divide-y divide-amber-100">
            {pendingPosts.map(post => (
              <div key={post.id} className="px-5 py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PLATFORM_SOCIAL_BADGE[post.platform] ?? ''}`}>{post.platform}</span>
                    <span className="text-xs text-slate-400 capitalize">{post.pillar?.replace(/_/g, ' ')}</span>
                    {post.scheduled_for && (
                      <span className="text-xs text-slate-400">· {new Date(post.scheduled_for).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                  <span className="text-xs text-amber-600 font-semibold flex-shrink-0">${post.cost_usd}</span>
                </div>

                {/* Social post preview — mirrors how it'll look on Facebook/Instagram */}
                {(() => {
                  const imgUrl = postImageOverrides[post.id] !== undefined ? postImageOverrides[post.id] : post.image_url;
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      {/* Platform header */}
                      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-100">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 leading-none">Your Business</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{post.platform} · Scheduled</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${PLATFORM_SOCIAL_BADGE[post.platform] ?? 'bg-slate-100 text-slate-500'}`}>{post.platform}</span>
                      </div>
                      {/* Post text */}
                      <div className="px-3 py-2">
                        <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-line line-clamp-4">{editPost?.id === post.id ? editPost!.content : post.content}</p>
                        {post.hashtags?.length > 0 && (
                          <p className="text-[10px] text-indigo-500 mt-1">{(post.hashtags as string[]).map(h => `#${h}`).join(' ')}</p>
                        )}
                      </div>
                      {/* Image */}
                      {imgUrl ? (
                        <div className="relative group">
                          <img src={imgUrl} alt="Post visual" className="w-full aspect-video object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button onClick={() => openMediaPicker(post.id)} className="bg-white text-slate-900 text-xs font-semibold px-3 py-1.5 rounded-lg">Change</button>
                            <button onClick={() => handleSetPostImage(post.id, null)} className="bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Remove</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mx-3 mb-3 border-2 border-dashed border-slate-200 rounded-lg h-24 flex items-center justify-center">
                          <button onClick={() => openMediaPicker(post.id)} className="text-xs text-slate-400 hover:text-indigo-600 transition-colors">+ Add image</button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Media picker panel */}
                {mediaPickerPost === post.id && (
                  <div className="border-2 border-indigo-200 bg-indigo-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-indigo-700">Attach image to post</p>
                      <button onClick={() => setMediaPickerPost(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleGenerateImageForPost(post.id)}
                        disabled={generatingImage}
                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex-shrink-0"
                      >
                        {generatingImage ? (
                          <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating...</>
                        ) : (
                          <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>Generate with AI</>
                        )}
                      </button>
                      <label className="flex items-center gap-1.5 border border-indigo-300 bg-white text-indigo-700 text-xs font-semibold px-3 py-2 rounded-xl cursor-pointer hover:bg-indigo-100 transition-colors flex-shrink-0">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        {uploadingMedia ? 'Uploading...' : 'Upload from computer'}
                        <input type="file" accept="image/*" className="hidden" disabled={uploadingMedia} onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadForPost(post.id, f); }} />
                      </label>
                    </div>
                    {brandAssets && brandAssets.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-2">Or pick from your brand library:</p>
                        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                          {brandAssets.map((a: any) => (
                            <button key={a.id} onClick={() => handleSetPostImage(post.id, a.public_url)} className="aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-indigo-400 transition-colors">
                              <img src={a.public_url} alt={a.filename} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {brandAssets && brandAssets.length === 0 && (
                      <p className="text-xs text-slate-400">{t('empty.noImages')}</p>
                    )}
                  </div>
                )}

                {/* Text edit mode — only shown when explicitly editing */}
                {editPost?.id === post.id && (
                  <textarea
                    value={editPost!.content}
                    onChange={e => setEditPost({ id: post.id, content: e.target.value })}
                    rows={4}
                    autoFocus
                    className="w-full border border-amber-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none bg-white"
                  />
                )}

                {rejectingPost === post.id ? (
                  <div className="space-y-2">
                    <input
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection (optional)"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setRejectingPost(null); setRejectReason(''); }} className="flex-1 border border-slate-200 text-slate-600 text-sm font-semibold py-2 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                      <button onClick={() => handleReject(post.id)} className="flex-1 bg-red-500 text-white text-sm font-semibold py-2 rounded-xl hover:bg-red-600 transition-colors">Confirm Reject</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setEditPost(editPost?.id === post.id ? null : { id: post.id, content: post.content })}
                      className="border border-slate-200 text-slate-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      {editPost?.id === post.id ? 'Cancel edit' : 'Edit text'}
                    </button>
                    <button
                      onClick={() => mediaPickerPost === post.id ? setMediaPickerPost(null) : openMediaPicker(post.id)}
                      className="border border-slate-200 text-slate-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {mediaPickerPost === post.id ? 'Close' : 'Image'}
                    </button>
                    <button onClick={() => setRejectingPost(post.id)} className="border border-red-200 text-red-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-red-50 transition-colors">Reject</button>
                    <button
                      onClick={() => handleApprove(post.id, 'now')}
                      disabled={generatingPost === post.id}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                    >
                      {generatingPost === post.id ? 'Publishing...' : 'Publish now'}
                    </button>
                    <button
                      onClick={() => setScheduleFor(scheduleFor?.id === post.id ? null : { id: post.id, value: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16) })}
                      disabled={generatingPost === post.id}
                      className="border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      {scheduleFor?.id === post.id ? 'Cancel' : 'Pick time'}
                    </button>
                    <button
                      onClick={() => handleApprove(post.id, 'keep')}
                      disabled={generatingPost === post.id}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                    >
                      Approve as scheduled ({post.scheduled_for ? new Date(post.scheduled_for).toLocaleString() : 'no date'})
                    </button>
                  </div>
                )}
                {scheduleFor && scheduleFor.id === post.id && (() => {
                  const sf = scheduleFor;
                  return (
                  <div className="px-5 pb-4 -mt-2 flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={sf.value}
                      onChange={e => setScheduleFor({ id: sf.id, value: e.target.value })}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-xs"
                    />
                    <button
                      onClick={() => handleApprove(post.id, 'custom', new Date(sf.value).toISOString())}
                      disabled={generatingPost === post.id || !sf.value}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl"
                    >
                      Schedule
                    </button>
                  </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Posts list */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-700">All Posts</p>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">All statuses</option>
            <option value="pending_approval">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="published">Published</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        {posts.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            {t('empty.noPosts')}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {posts.map(post => {
              const postAnalytics = analytics?.posts?.find((p: any) => p.id === post.id)?.analytics;
              return (
                <div key={post.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${PLATFORM_SOCIAL_BADGE[post.platform] ?? ''}`}>{post.platform}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize flex-shrink-0 ${SOCIAL_STATUS_STYLES[post.status] ?? 'bg-slate-100 text-slate-500'}`}>{post.status.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-slate-400 capitalize">{post.pillar?.replace(/_/g, ' ')}</span>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {post.scheduled_for
                        ? new Date(post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : post.published_at
                        ? `Published ${new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : '—'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2 leading-relaxed line-clamp-2">{post.client_edit || post.content}</p>
                  {postAnalytics && (
                    <div className="mt-2 flex gap-4">
                      {[
                        { label: 'Reach', value: postAnalytics.reach?.toLocaleString() },
                        { label: 'Likes', value: postAnalytics.likes },
                        { label: 'Comments', value: postAnalytics.comments },
                        { label: 'Shares', value: postAnalytics.shares },
                        { label: 'Eng. rate', value: postAnalytics.engagement_rate ? `${(postAnalytics.engagement_rate * 100).toFixed(1)}%` : null },
                      ].filter(x => x.value !== null && x.value !== undefined).map(x => (
                        <div key={x.label} className="text-center">
                          <p className="text-xs font-bold text-slate-800">{x.value}</p>
                          <p className="text-xs text-slate-400">{x.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Edit / Reschedule / Delete — available for any non-published post */}
                  <PostActions post={post} onChange={load} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      </div>)}

      {/* Connect section — clean UI, no technical jargon */}
      {activeSection === 'connect' && (
        <div className="space-y-5 max-w-xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your connections</h2>
            <p className="text-sm text-slate-500 mt-1">Vigmis will manage your campaigns and posts through these connections.</p>
          </div>

          {!metaConnected && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">Facebook & Instagram</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                One click opens Facebook. On their screen you'll approve all the permissions Vigmis needs at once — and you're done.
              </p>
              <button
                onClick={handleConnectMeta}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                Connect Facebook
              </button>
            </div>
          )}

          {metaConnected && (
            <>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Facebook Page</p>
                    {(selectedPageId || settings?.facebook_page_id) ? (
                      <>
                        <p className="text-base font-bold text-slate-900 mt-0.5">
                          <bdi>{pages?.find(p => p.page_id === (selectedPageId ?? settings?.facebook_page_id))?.name ?? 'Connected'}</bdi>
                        </p>
                        {(selectedIgUserId || settings?.instagram_user_id) && (
                          <p className="text-xs text-violet-600 mt-1">
                            Instagram: <bdi>@{pages?.find(p => p.instagram_user_id === (selectedIgUserId ?? settings?.instagram_user_id))?.instagram_username ?? 'linked'}</bdi>
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-amber-600 mt-0.5">{t('empty.noPageSelected')}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { if (editing !== 'page') { loadPages(); setEditing('page'); } else { setEditing(null); } }}
                    className="text-sm border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl"
                  >
                    {editing === 'page' ? 'Close' : (selectedPageId || settings?.facebook_page_id) ? 'Change' : 'Choose Page'}
                  </button>
                </div>

                {editing === 'page' && (
                  <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                    {pagesLoading && <p className="text-sm text-slate-500">Loading Pages from Facebook…</p>}
                    {pagesError && <p className="text-xs text-red-600">{pagesError}</p>}
                    {pages && pages.length === 0 && (
                      <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        Facebook returned no Pages. You need admin access to at least one Page.
                      </p>
                    )}
                    {pages?.map(p => {
                      const isSelected = p.page_id === (selectedPageId ?? settings?.facebook_page_id);
                      return (
                        <button
                          key={p.page_id}
                          onClick={async () => { await handleSelectPage(p); setEditing(null); }}
                          disabled={pageSaving}
                          className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                            isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900"><bdi>{p.name}</bdi></p>
                          {p.instagram_username
                            ? <p className="text-xs text-violet-600 mt-0.5">Instagram: <bdi>@{p.instagram_username}</bdi></p>
                            : <p className="text-xs text-slate-400 mt-0.5">No Instagram linked</p>}
                          {isSelected && <p className="text-xs text-emerald-600 font-semibold mt-1">Selected</p>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Ad Account</p>
                    {adAccountSelected ? (
                      <p className="text-base font-bold text-slate-900 mt-0.5">
                        <bdi>{adAccounts?.find(a => a.id === adAccountSelected)?.name ?? 'Connected'}</bdi>
                      </p>
                    ) : (
                      <p className="text-sm text-amber-600 mt-0.5">{t('empty.noAdAccountSelected')}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { if (editing !== 'account') { loadAdAccounts(); setEditing('account'); } else { setEditing(null); } }}
                    className="text-sm border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl"
                  >
                    {editing === 'account' ? 'Close' : adAccountSelected ? 'Change' : 'Choose Account'}
                  </button>
                </div>

                {editing === 'account' && (
                  <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                    {adAccountLoading && <p className="text-sm text-slate-500">Loading Ad Accounts from Facebook…</p>}
                    {adAccountError && <p className="text-xs text-red-600">{adAccountError}</p>}
                    {adAccounts && adAccounts.length === 0 && (
                      <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        Facebook returned no Ad Accounts. Make sure you have admin access to at least one.
                      </p>
                    )}
                    {adAccounts?.map(a => {
                      const isSelected = a.id === adAccountSelected;
                      return (
                        <button
                          key={a.id}
                          onClick={async () => { await handleSelectAdAccount(a.id); setEditing(null); }}
                          disabled={adAccountSaving}
                          className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                            isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900"><bdi>{a.name}</bdi></p>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                            {a.business && <span>Business: <bdi>{a.business}</bdi></span>}
                            {a.currency && <span>Currency: <bdi>{a.currency}</bdi></span>}
                            <span>{a.active ? 'Active' : 'Inactive'}</span>
                          </div>
                          {isSelected && <p className="text-xs text-emerald-600 font-semibold mt-1">Selected</p>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Google Analytics (optional)</p>
                    {ga4Settings ? (
                      <>
                        <p className="text-base font-bold text-slate-900 mt-0.5"><bdi>{ga4Settings.property_name ?? 'Connected'}</bdi></p>
                        <p className="text-xs text-slate-500 mt-0.5">Vigmis measures campaign results from your website instead of relying on Facebook and Google's own reports.</p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500 mt-0.5">Connecting Analytics lets Vigmis judge campaigns on real on-site conversions instead of platform-reported numbers.</p>
                    )}
                  </div>
                  <button
                    onClick={() => { if (editing !== 'ga4') { loadGa4(); setEditing('ga4'); } else { setEditing(null); } }}
                    className="text-sm border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl"
                  >
                    {editing === 'ga4' ? 'Close' : ga4Settings ? 'Change' : 'Connect'}
                  </button>
                </div>

                {editing === 'ga4' && (
                  <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                    {ga4Loading && <p className="text-sm text-slate-500">Loading properties from Google Analytics…</p>}
                    {ga4Error && <p className="text-xs text-red-600">{ga4Error}</p>}
                    {ga4Properties && ga4Properties.length === 0 && (
                      <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">No Analytics properties found on this Google account. Create one at analytics.google.com and try again.</p>
                    )}
                    {ga4Properties?.map(p => {
                      const isSelected = p.property_id === ga4Settings?.property_id;
                      return (
                        <button
                          key={p.property_id}
                          onClick={async () => { await handleSelectGa4(p); setEditing(null); }}
                          disabled={ga4Saving}
                          className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                            isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900"><bdi>{p.display_name}</bdi></p>
                          {isSelected && <p className="text-xs text-emerald-600 font-semibold mt-1">Selected</p>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={handleDisconnectMeta}
                  disabled={disconnecting}
                  className="text-xs text-red-600 hover:text-red-700 underline disabled:opacity-50"
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect Vigmis from Facebook'}
                </button>
              </div>
            </>
          )}

          {/* ── Google Ads ── */}
          {!googleConnected ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">Google Ads</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Connect your Google Ads account. After connecting, you'll choose which ad account Vigmis should manage.
              </p>
              <button
                onClick={handleConnectGoogleAds}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
              >
                Connect Google Ads
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Google Ads Account</p>
                  {googleAccountSelected ? (
                    <p className="text-base font-bold text-slate-900 mt-0.5">Account {googleAccountSelected}</p>
                  ) : (
                    <p className="text-sm text-amber-600 mt-0.5">{t('empty.noAdAccountSelected')}</p>
                  )}
                </div>
                <button
                  onClick={() => { if (editing !== 'google_account') { loadGoogleAccounts(); setEditing('google_account'); } else { setEditing(null); } }}
                  className="text-sm border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl"
                >
                  {editing === 'google_account' ? 'Close' : googleAccountSelected ? 'Change' : 'Choose Account'}
                </button>
              </div>

              {editing === 'google_account' && (
                <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                  {googleAccountLoading && <p className="text-sm text-slate-500">Loading accounts from Google…</p>}
                  {googleAccountError && <p className="text-xs text-red-600">{googleAccountError}</p>}
                  {googleAccounts && googleAccounts.length === 0 && (
                    <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                      No Google Ads accounts found. Make sure you have access to at least one account at ads.google.com.
                    </p>
                  )}
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {googleAccounts?.map(a => {
                      const isSelected = a.id === googleAccountSelected;
                      const isInactive = a.status && a.status !== 'ENABLED' && a.status !== 'UNKNOWN';
                      return (
                        <button
                          key={a.id}
                          onClick={() => handleSelectGoogleAccount(a.id)}
                          disabled={googleAccountSaving}
                          className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                            isSelected ? 'border-emerald-300 bg-emerald-50' : isInactive ? 'border-amber-200 bg-amber-50 hover:border-amber-300' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-900">{a.name}</p>
                          {isSelected && <p className="text-xs text-emerald-600 font-semibold mt-1">Selected</p>}
                          {isInactive && (
                            <p className="text-xs text-amber-700 mt-1">
                              Account status: {a.status?.toLowerCase()} — activate it in Google Ads before using with Vigmis.
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Google Analytics (separate connection) ── */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Google Analytics 4</p>
                {ga4Settings ? (
                  <>
                    <p className="text-base font-bold text-slate-900 mt-0.5">{ga4Settings.property_name ?? 'Connected'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Real conversion data — not platform estimates</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500 mt-0.5">
                    Optional but recommended. Uses a separate Google login — can be a different account than Google Ads.
                  </p>
                )}
              </div>
              {ga4Settings ? (
                <button
                  onClick={() => { if (editing !== 'ga4') { loadGa4(); setEditing('ga4'); } else { setEditing(null); } }}
                  className="text-sm border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl"
                >
                  {editing === 'ga4' ? 'Close' : 'Change'}
                </button>
              ) : (
                <button
                  onClick={handleConnectGoogleAnalytics}
                  className="text-sm bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-xl"
                >
                  Connect Analytics
                </button>
              )}
            </div>

            {editing === 'ga4' && (
              <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
                {ga4Loading && <p className="text-sm text-slate-500">Loading properties from Google Analytics…</p>}
                {ga4Error && <p className="text-xs text-red-600">{ga4Error}</p>}
                {ga4Properties?.map(p => {
                  const isSelected = p.property_id === ga4Settings?.property_id;
                  return (
                    <button
                      key={p.property_id}
                      onClick={async () => { await handleSelectGa4(p); setEditing(null); }}
                      disabled={ga4Saving}
                      className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                        isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-green-300 hover:bg-green-50'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{p.display_name}</p>
                      {isSelected && <p className="text-xs text-emerald-600 font-semibold mt-1">Selected</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Old connect section — replaced above. Kept as dead branch so JSX stays balanced. */}

      {/* Comments section */}
      {activeSection === 'comments' && (
        <div className="space-y-4">
          {comments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl px-5 py-12 text-center text-sm text-slate-400 shadow-sm">
              No comments pending review. Vigmis checks for new comments every 4 hours.
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map(comment => (
                <div key={comment.id} className={`bg-white border rounded-xl overflow-hidden shadow-sm ${comment.sentiment === 'complaint' ? 'border-red-200' : comment.sentiment === 'question' ? 'border-blue-200' : 'border-slate-200'}`}>
                  <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PLATFORM_SOCIAL_BADGE[comment.platform] ?? ''}`}>{comment.platform}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${SENTIMENT_STYLE[comment.sentiment] ?? ''}`}>{comment.sentiment.replace('_', ' ')}</span>
                      {comment.author_name && <span className="text-xs text-slate-400">{comment.author_name}</span>}
                      {comment.priority_score != null && Number(comment.priority_score) >= 75 && (
                        <span className="text-xs bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded-full">🔥 HOT · {Math.round(Number(comment.priority_score))}</span>
                      )}
                      {comment.priority_score != null && Number(comment.priority_score) < 75 && Number(comment.priority_score) >= 50 && (
                        <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">priority {Math.round(Number(comment.priority_score))}</span>
                      )}
                      {comment.classifier_confidence != null && Number(comment.classifier_confidence) < 0.85 && (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full" title="Classifier not confident — human review recommended">
                          confidence {Math.round(Number(comment.classifier_confidence) * 100)}%
                        </span>
                      )}
                      {comment.do_not_engage && (
                        <span className="text-xs bg-slate-700 text-white font-bold px-2 py-0.5 rounded-full" title={comment.no_engage_reason ?? ''}>do-not-engage</span>
                      )}
                      {comment.reply_blocked_by_policy && (
                        <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">draft blocked</span>
                      )}
                      {comment.routing_recommendation === 'private_dm' && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">→ DM suggested</span>
                      )}
                      {comment.routing_recommendation === 'escalate' && (
                        <span className="text-xs bg-orange-100 text-orange-800 font-bold px-2 py-0.5 rounded-full">escalate</span>
                      )}
                      {(comment.sentiment === 'complaint' || comment.sentiment === 'angry' || comment.sentiment === 'legal_risk' || comment.sentiment === 'hate') && (
                        <span className="text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">URGENT</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(comment.commented_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
                      <p className="text-sm text-slate-700 leading-relaxed">"{comment.text}"</p>
                    </div>
                    {comment.ai_recommendation && (
                      <p className="text-xs text-slate-500 leading-relaxed">
                        <span className="font-semibold text-indigo-600">Vigmis: </span>
                        {comment.ai_recommendation}
                      </p>
                    )}
                    {comment.sentiment !== 'spam' && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500">Suggested reply</p>
                        {editReply?.id === comment.id ? (
                          <textarea
                            value={editReply!.text}
                            onChange={e => setEditReply({ id: comment.id, text: e.target.value })}
                            rows={3}
                            className="w-full border border-indigo-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          />
                        ) : (
                          <p className="text-sm text-slate-700 bg-indigo-50 rounded-lg px-3 py-2.5 leading-relaxed">
                            {comment.ai_draft_reply || <span className="text-slate-400 italic">No draft</span>}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {comment.sentiment === 'spam' ? (
                        <>
                          <button onClick={() => handleHide(comment.id)} className="flex-1 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold py-2 rounded-xl transition-colors">Hide comment</button>
                          <button onClick={() => handleIgnore(comment.id)} className="border border-slate-200 text-slate-500 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">Ignore</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditReply(editReply?.id === comment.id ? null : { id: comment.id, text: comment.ai_draft_reply ?? '' })} className="border border-slate-200 text-slate-600 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                            {editReply?.id === comment.id ? 'Cancel' : 'Edit reply'}
                          </button>
                          <button onClick={() => handleIgnore(comment.id)} className="border border-slate-200 text-slate-400 text-xs font-semibold px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors">No reply needed</button>
                          <button
                            onClick={() => handleSendReply(comment.id)}
                            disabled={sendingReply === comment.id || (!comment.ai_draft_reply && editReply?.id !== comment.id)}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
                          >
                            {sendingReply === comment.id ? 'Sending...' : 'Send reply ($0.05)'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {reconnectModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Reconnect Facebook</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your Facebook permissions for Vigmis are out of date. One click will reconnect — approve every permission on Facebook's screen and you're done.
            </p>
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer">Technical details (for support)</summary>
              <pre dir="auto" className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2 text-[10px] whitespace-pre-wrap break-all max-h-40 overflow-auto">{reconnectModal.rawError || '(no error message)'}</pre>
            </details>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setReconnectModal({ open: false, rawError: '' })}
                className="text-sm border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl text-slate-700"
              >
                Not now
              </button>
              <button
                onClick={handleConnectMeta}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl"
              >
                Reconnect Facebook
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
