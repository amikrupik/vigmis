'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import Image from 'next/image';
import OnboardingChat from '../components/OnboardingChat';
import LanguageSelector from '../components/LanguageSelector';
import type { OnboardingSettings, AnalysisResult, WebsiteCheck, PixelSnippet } from './actions';
import { runAnalysis, discussStrategy, checkWebsite, getPixelSnippet, verifyPixel, startShopifyConnect, reportIncident } from './actions';
import { recordAttestation } from '../components/attestation-actions';
import {
  getMetaPages, selectMetaPage, type MetaPage,
  getMetaAdAccounts, selectMetaAdAccount, type MetaAdAccount,
} from '../dashboard/actions';
import type { ConversationMessage } from '@vigmis/db';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Step = 'connect' | 'meta_assets' | 'chat' | 'analysis' | 'website_check' | 'website_describe' | 'strategy' | 'creative' | 'tracking' | 'saving';
type CreativeChoice = 'avatar' | 'cinematic' | 'animation' | 'upload' | 'skip' | null;

const STEPS: { key: Step; tKey: string }[] = [
  { key: 'connect', tKey: 'steps.connect' },
  { key: 'meta_assets', tKey: 'steps.choosePage' },
  { key: 'chat', tKey: 'steps.interview' },
  { key: 'analysis', tKey: 'steps.analysis' },
  { key: 'strategy', tKey: 'steps.strategy' },
  { key: 'creative', tKey: 'steps.creative' },
  { key: 'tracking', tKey: 'steps.tracking' },
];

const STEP_INDEX: Record<Step, number> = {
  connect: 0, meta_assets: 1, chat: 2, analysis: 3, website_check: 3, website_describe: 3, strategy: 4, creative: 5, tracking: 6, saving: 7,
};

const ANALYSIS_STEP_KEYS = ['analysis.scanningWebsite', 'analysis.researchingMarket', 'analysis.buildingPlan'] as const;
const ANALYSIS_STEP_IDS = ['website', 'research', 'strategy'] as const;

const PLATFORM_BAR: Record<string, string> = {
  google: 'bg-blue-500',
  meta: 'bg-violet-500',
  tiktok: 'bg-slate-800',
};

interface Props {
  initialConnected?: string;
  initialError?: string;
  rethinkMode?: boolean;
}

const ONBOARDING_PERSIST_KEY = 'vigmis_onboarding_progress';

export default function OnboardingPageClient({ initialConnected, initialError, rethinkMode }: Props) {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const posthog = usePostHog();
  const posthogStartedRef = useRef(false);
  const [step, setStep] = useState<Step>('connect');
  const [showRethinkWarning, setShowRethinkWarning] = useState(rethinkMode === true);
  // Never initialise from the URL param — it only reflects the LAST connected platform
  // and would show Google as disconnected after connecting Meta. The useEffect below
  // always fetches the real state from the API.
  const [connected, setConnected] = useState({ google: false, meta: false, tiktok: false });
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode] = useState<string | null>(initialError ?? null);
  const consecutiveErrorsRef = useRef(0);

  // Track onboarding_started once on mount
  useEffect(() => {
    if (!posthogStartedRef.current) {
      posthogStartedRef.current = true;
      posthog?.capture('onboarding_started');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Translate OAuth error once translations are mounted
  useEffect(() => {
    if (initialError) {
      const key = `connect.oauthErrors.${initialError}` as Parameters<typeof t>[0];
      try { setError(t(key)); } catch { setError('Connection error'); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pendingSettings, setPendingSettings] = useState<OnboardingSettings | null>(null);
  const [pendingConversation, setPendingConversation] = useState<ConversationMessage[]>([]);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [strategyFeedback, setStrategyFeedback] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [creativeChoice, setCreativeChoice] = useState<CreativeChoice>(null);
  const [discussionResponse, setDiscussionResponse] = useState<string | null>(null);
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [planApproved, setPlanApproved] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [aiDisclaimerAccepted, setAiDisclaimerAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [hasParallelCampaigns, setHasParallelCampaigns] = useState(false);
  const [socialEnabled, setSocialEnabled] = useState(false);
  const [socialPlatforms, setSocialPlatforms] = useState<('facebook' | 'instagram' | 'tiktok')[]>(['facebook', 'instagram']);
  const [socialApprovalMode, setSocialApprovalMode] = useState<'auto' | 'review' | 'strict'>('review');
  const [websiteCheck, setWebsiteCheck] = useState<WebsiteCheck | null>(null);
  const [websiteNotes, setWebsiteNotes] = useState('');
  const [websiteDescription, setWebsiteDescription] = useState('');
  const [pixelSnippet, setPixelSnippet] = useState<PixelSnippet | null>(null);

  // Google Ads account selector (shown inline in connect step after Google OAuth)
  const [googleAccounts, setGoogleAccounts] = useState<{ id: string; name: string; status?: string }[] | null>(null);
  const [googleAccountSelected, setGoogleAccountSelected] = useState<string | null>(null);
  const [googleAccountLoading, setGoogleAccountLoading] = useState(false);
  const [googleAccountSaving, setGoogleAccountSaving] = useState(false);
  const [googleAccountError, setGoogleAccountError] = useState<string | null>(null);

  // Restore onboarding progress from sessionStorage on mount.
  // Language switch calls window.location.reload() — this ensures the user doesn't
  // lose their place in the onboarding flow when they switch languages.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(ONBOARDING_PERSIST_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.step && parsed.step !== 'connect') setStep(parsed.step as Step);
        if (parsed.pendingConversation?.length) setPendingConversation(parsed.pendingConversation);
        if (parsed.pendingSettings) setPendingSettings(parsed.pendingSettings);
        if (parsed.analysisResult) setAnalysisResult(parsed.analysisResult);
        if (parsed.websiteNotes) setWebsiteNotes(parsed.websiteNotes);
      }
    } catch { /* ignore — corrupted storage */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist onboarding progress to sessionStorage on every meaningful state change.
  // Cleared on completion (router.push to dashboard) and when returning to step 'connect'.
  // Also track step changes for PostHog.
  useEffect(() => {
    if (step === 'connect' || step === 'saving') return;
    posthog?.capture('onboarding_step_completed', { step });
    try {
      sessionStorage.setItem(ONBOARDING_PERSIST_KEY, JSON.stringify({
        step,
        pendingConversation,
        pendingSettings,
        analysisResult,
        websiteNotes,
      }));
    } catch { /* ignore — storage full */ }
  }, [step, pendingConversation, pendingSettings, analysisResult, websiteNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the real connection status from the API on every mount.
  // The URL param (?connected=meta) only tells us the LAST platform — so connecting Meta
  // would make Google appear disconnected if we used the URL. We ignore the URL entirely
  // and rely only on /auth/status. Retries up to 5× because Clerk may not be ready
  // immediately after an OAuth redirect reloads the page.
  useEffect(() => {
    async function fetchConnectionStatus(attempt = 0) {
      try {
        const token = await getClerkToken();
        const res = await fetch(`${API_URL}/auth/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const status = await res.json();
          setConnected({
            google: status.google === true,
            meta: status.meta === true,
            tiktok: status.tiktok === true,
          });
          setTiktokAvailable(status.tiktok_available === true);
          if (status.google) loadGoogleAccountsForOnboarding();
        }
        setStatusLoading(false);
      } catch {
        if (attempt < 5) {
          setTimeout(() => fetchConnectionStatus(attempt + 1), 500 * (attempt + 1));
        } else {
          setStatusLoading(false);
        }
      }
    }
    fetchConnectionStatus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadGoogleAccountsForOnboarding() {
    setGoogleAccountLoading(true);
    setGoogleAccountError(null);
    try {
      const token = await getClerkToken();
      const res = await fetch(`${API_URL}/connectors/google/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGoogleAccounts(data.accounts ?? []);
        if (data.selected) setGoogleAccountSelected(data.selected);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = (data as any)?.error ?? 'Could not load Google Ads accounts.';
        setGoogleAccountError(msg);
        setGoogleAccounts([]);
      }
    } catch {
      setGoogleAccountError('Network error — could not reach server.');
      setGoogleAccounts([]);
    }
    setGoogleAccountLoading(false);
  }

  async function handleSelectGoogleAccountOnboarding(id: string) {
    setGoogleAccountSaving(true);
    try {
      const token = await getClerkToken();
      await fetch(`${API_URL}/connectors/google/select-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: id }),
      });
      setGoogleAccountSelected(id);
    } catch { /* silent */ }
    setGoogleAccountSaving(false);
  }
  const [pixelCopied, setPixelCopied] = useState(false);
  const [pixelVerifying, setPixelVerifying] = useState(false);
  const [pixelVerified, setPixelVerified] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [shopifyConnecting, setShopifyConnecting] = useState(false);
  const [tiktokAvailable, setTiktokAvailable] = useState(false);

  async function handleConnect(platform: 'google' | 'meta') {
    try {
      const token = await getClerkToken();
      window.location.href = `${API_URL}/auth/${platform}?token=${encodeURIComponent(token)}`;
    } catch {
      setError(t('connect.sessionError'));
    }
  }

  // Records the three master attestations a tenant must sign at onboarding.
  // Fire-and-forget on individual failures — we don't want to block onboarding
  // if one attestation insert hiccups, since the master is the load-bearing one.
  async function recordOnboardingAttestations() {
    const results = await Promise.allSettled([
      recordAttestation({ kind: 'onboarding_master' }),
      recordAttestation({ kind: 'tos_acceptance' }),
      recordAttestation({ kind: 'ai_disclosure_consent' }),
    ]);
    const masterResult = results[0];
    if (masterResult.status === 'rejected') {
      throw new Error(masterResult.reason instanceof Error ? masterResult.reason.message : 'attestation failed');
    }
  }

  async function handleChatConfirm(settings: OnboardingSettings, conversation: ConversationMessage[]) {
    setPendingSettings(settings);
    setPendingConversation(conversation);
    // Seed Ask Vigmis with business context so the chat isn't blind during onboarding
    try {
      localStorage.setItem('vigmis_onboarding_ctx', JSON.stringify({
        website_url: settings.website_url,
        business_type: settings.business_type,
        goal: settings.goal,
        geo: (settings.geo_include ?? []).join(', '),
      }));
    } catch { /* ignore */ }
    await runAnalysisFlow(settings);
  }

  async function runAnalysisFlow(settings: OnboardingSettings, feedback?: string, skipWebsiteCheck = false) {
    setStep('analysis');
    setAnalysisStep(0);
    setError(null);
    try {
      // Phase 1: Quick website understanding (skip on re-runs / feedback revisions)
      if (!skipWebsiteCheck && settings.website_url && !feedback) {
        const check = await checkWebsite(settings.website_url);
        setWebsiteCheck(check);
        // Website couldn't load at all (JS-rendered / blocked / DNS fail) → skip to manual describe
        if (!check.adequate && !check.summary) {
          setStep('website_describe');
          return;
        }
        // Website was read but has clarification questions
        if (!check.adequate || check.unclear.length > 0) {
          setStep('website_check');
          return;
        }
        // Adequate with no questions — continue directly
      }

      // Phase 2: Full strategy analysis
      const timer1 = setTimeout(() => setAnalysisStep(1), 1500);
      const timer2 = setTimeout(() => setAnalysisStep(2), 4000);
      const settingsWithNotes = websiteNotes.trim()
        ? { ...settings, open_notes: [settings.open_notes, `Website clarification: ${websiteNotes.trim()}`].filter(Boolean).join('\n') }
        : settings;
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Analysis is taking longer than expected. Please try again.')), 270_000)
      );
      const result = await Promise.race([runAnalysis(settingsWithNotes, feedback), timeout]);
      clearTimeout(timer1);
      clearTimeout(timer2);
      // Check for returned error object (Server Action returns instead of throws)
      if ('error' in result) {
        if (result.code === 'website_unreadable') {
          setError(null);
          setStep('website_describe');
        } else {
          consecutiveErrorsRef.current += 1;
          setError(result.message);
          setStep('chat');
          if (consecutiveErrorsRef.current >= 3) {
            reportIncident('analysis_failed', result.message, consecutiveErrorsRef.current);
          }
        }
        return;
      }
      // Success — reset error counter
      consecutiveErrorsRef.current = 0;
      setAnalysisStep(3);
      await new Promise(r => setTimeout(r, 500));
      setAnalysisResult(result);
      setStep('strategy');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
      consecutiveErrorsRef.current += 1;
      setError(msg);
      setStep('chat');
      if (consecutiveErrorsRef.current >= 3) {
        reportIncident('analysis_failed', msg, consecutiveErrorsRef.current);
      }
    }
  }

  async function handleRevise() {
    if (!strategyFeedback.trim() || !pendingSettings) return;
    setIsRevising(true);
    setError(null);
    const feedback = discussionResponse
      ? `${strategyFeedback}\n\nNote: Vigmis shared concerns, but the client has decided to proceed with the above changes as their final decision. Incorporate them fully and note any risks briefly.`
      : strategyFeedback;
    setStrategyFeedback('');
    setShowFeedback(false);
    setDiscussionResponse(null);
    await runAnalysisFlow(pendingSettings, feedback);
    setIsRevising(false);
  }

  async function handleCreativeDone(choice: CreativeChoice) {
    setCreativeChoice(choice);
    // Load pixel snippet then go to tracking step
    const snippet = await getPixelSnippet().catch(() => null);
    setPixelSnippet(snippet);
    setStep('tracking');
  }

  async function handleTrackingDone(skipTracking = false) {
    if (!pendingSettings || !analysisResult) {
      setError('Session error — please go back and complete the previous steps again.');
      return;
    }
    setStep('saving');
    setError(null);
    try {
      const token = await getClerkToken();
      const body = JSON.stringify({
        ...pendingSettings,
        has_parallel_campaigns: hasParallelCampaigns,
        conversation: pendingConversation,
        strategy_plan: analysisResult.strategy,
        website_analysis: analysisResult.websiteAnalysis,
        creative_choice: creativeChoice,
        tracking_verified: pixelVerified && !skipTracking,
        social_opt_in: socialEnabled ? {
          enabled: true,
          platforms: socialPlatforms,
          approval_mode: socialApprovalMode,
          content_pillars: analysisResult.strategy.social_plan?.content_pillars,
        } : undefined,
      });
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      let res = await fetch(`${API_URL}/onboarding/settings`, { method: 'POST', headers, body });

      // Attestations may have failed silently in step 1 — record them now and retry once.
      if (res.status === 412) {
        const errData = await res.json().catch(() => ({}));
        if (errData?.error === 'attestation_required') {
          await recordOnboardingAttestations();
          res = await fetch(`${API_URL}/onboarding/settings`, { method: 'POST', headers, body });
        }
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const detail = errData?.details?.fieldErrors
          ? Object.entries(errData.details.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join(' | ')
          : errData?.message ?? errData?.error ?? 'Failed to save settings';
        throw new Error(detail);
      }
      sessionStorage.removeItem(ONBOARDING_PERSIST_KEY);
      posthog?.capture('onboarding_completed');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setStep('tracking');
    }
  }

  // ── Language switcher ─────────────────────────────────────────────────────────
  function switchLanguage(lang: string) {
    document.cookie = `vigmis_lang=${lang};path=/;max-age=31536000`;
    window.location.reload();
  }

  const currentLang = typeof document !== 'undefined'
    ? (document.cookie.match(/vigmis_lang=([^;]+)/)?.[1] ?? 'en')
    : 'en';

  // ── Header ────────────────────────────────────────────────────────────────────
  const header = (
    <header className="border-b border-slate-200 bg-white px-4 py-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <Image src="/logo_nav.png" alt="Vigmis" width={140} height={32} priority className="flex-shrink-0" />
        <div className="flex-1 flex items-center min-w-0 mx-2">
          {STEPS.map((s, i) => (
            <Fragment key={s.key}>
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                  STEP_INDEX[step] > i
                    ? 'bg-emerald-500 text-white'
                    : STEP_INDEX[step] === i
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  {STEP_INDEX[step] > i ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium hidden lg:block ${
                  STEP_INDEX[step] > i ? 'text-emerald-600' :
                  STEP_INDEX[step] === i ? 'text-indigo-600' :
                  'text-slate-400'
                }`}>{t(s.tKey as Parameters<typeof t>[0])}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1 min-w-[4px] ${STEP_INDEX[step] > i ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </Fragment>
          ))}
        </div>
        <div className="flex-shrink-0">
          <LanguageSelector />
        </div>
      </div>
    </header>
  );

  // ── Rethink Strategy warning modal ───────────────────────────────────────────
  if (showRethinkWarning) {
    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white border border-amber-200 rounded-2xl p-8 shadow-lg space-y-5">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <div>
                <h2 className="font-bold text-slate-900 text-lg">Rethink your strategy</h2>
                <p className="text-slate-500 text-sm mt-1">This will restart the strategy interview from scratch. Your campaigns will keep running at their current settings — Vigmis won't touch them until you complete and approve a new plan.</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">Before you continue:</p>
              <p>· Your current strategy and approval will be replaced</p>
              <p>· Active campaigns are NOT paused automatically</p>
              <p>· You'll need to re-approve the new plan before Vigmis applies changes</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRethinkWarning(false)} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm">
                Yes, rethink my strategy
              </button>
              <button onClick={() => router.push('/dashboard')} className="flex-1 border border-slate-200 text-slate-600 font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Connect ───────────────────────────────────────────────────────────────────
  if (step === 'connect') {
    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 flex items-center justify-center p-6 py-12">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-900">{t('connect.title')}</h1>
              <p className="text-slate-500 text-sm mt-2">
                {t('connect.subtitle')}
              </p>
              {statusLoading && (
                <div className="mt-3 flex justify-center">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              )}
              {!statusLoading && (connected.google || connected.meta || connected.tiktok) && (
                <div className="mt-3 flex justify-center gap-2 flex-wrap">
                  {connected.meta && <span className="text-xs bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full font-semibold">Meta ✓</span>}
                  {connected.google && <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold">Google ✓</span>}
                  {connected.tiktok && <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-semibold">TikTok ✓</span>}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            {(errorCode === 'google_denied' || errorCode === 'meta_denied') && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
                <p className="font-semibold">
                  {errorCode === 'google_denied'
                    ? "Don't have a Google Ads account yet?"
                    : "Don't have a Meta Business account yet?"}
                </p>
                <p>
                  It looks like the connection didn&apos;t complete. If you don&apos;t have a{' '}
                  {errorCode === 'google_denied' ? 'Google Ads' : 'Meta Business'} account yet,
                  you can create one for free — it takes about 5 minutes.
                </p>
                {errorCode === 'google_denied' && (
                  <a
                    href="https://ads.google.com/start"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                  >
                    Create a Google Ads account →
                  </a>
                )}
                {errorCode === 'meta_denied' && (
                  <a
                    href="https://www.facebook.com/business/help/1710077379203657"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                  >
                    Create a Meta Business account →
                  </a>
                )}
                <p className="text-xs text-blue-600">
                  Once your account is set up, come back here and click Connect again.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <button
                  onClick={() => handleConnect('google')}
                  className={`w-full flex items-center gap-4 bg-white border hover:shadow-md rounded-xl px-5 py-4 transition-all shadow-sm text-left ${connected.google ? 'border-emerald-300' : 'border-slate-200 hover:border-indigo-300'}`}
                >
                  <GoogleIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Google Ads</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t('connect.googleDesc')}</p>
                  </div>
                  {connected.google
                    ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold flex-shrink-0">{t('connect.connected')}</span>
                    : <span className="text-xs text-slate-400 flex-shrink-0">{t('connect.connectArrow')}</span>
                  }
                </button>

                {/* Google Ads account selector — shown immediately after connecting */}
                {connected.google && (
                  <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-blue-800 mb-2">
                      {googleAccountSelected ? `✓ ${t('connect.accountSelected')}` : t('connect.chooseAccount')}
                    </p>
                    {googleAccountLoading && <p className="text-xs text-slate-500">{t('connect.loadingAccounts')}</p>}

                    {!googleAccountLoading && googleAccountError && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                          {googleAccountError}
                        </p>
                        <button
                          onClick={() => handleConnect('google')}
                          className="text-xs text-indigo-600 hover:underline font-medium"
                        >
                          ↻ Reconnect with a different Google account
                        </button>
                      </div>
                    )}

                    {!googleAccountLoading && !googleAccountError && googleAccounts && googleAccounts.length === 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-amber-700">{t('connect.noAccounts')}</p>
                        <button
                          onClick={() => handleConnect('google')}
                          className="text-xs text-indigo-600 hover:underline font-medium"
                        >
                          ↻ Try a different Google account
                        </button>
                      </div>
                    )}

                    {!googleAccountLoading && !googleAccountError && googleAccounts?.map(a => {
                      const isCancelled = a.status === 'CANCELLED' || a.status === 'SUSPENDED';
                      const isSelected = googleAccountSelected === a.id;
                      return (
                        <div key={a.id} className="mb-1">
                          <button
                            onClick={() => {
                              if (isCancelled) return;
                              handleSelectGoogleAccountOnboarding(a.id);
                            }}
                            disabled={googleAccountSaving || isCancelled}
                            className={`w-full text-left border rounded-lg px-3 py-2 text-xs transition-all ${
                              isSelected
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-800 font-semibold'
                                : isCancelled
                                ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                                : 'border-slate-200 bg-white hover:border-blue-300'
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span>{isSelected ? '✓ ' : ''}{a.name}</span>
                              {a.status && a.status !== 'ENABLED' && a.status !== 'UNKNOWN' && (
                                <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isCancelled ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {a.status}
                                </span>
                              )}
                            </span>
                          </button>
                          {isCancelled && (
                            <p className="text-[10px] text-red-500 px-3 mt-0.5">
                              Reactivate at{' '}
                              <a href="https://ads.google.com" target="_blank" rel="noopener noreferrer" className="underline">
                                ads.google.com
                              </a>
                              {' '}to use with Vigmis
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!connected.google && (
                  <p className="text-xs text-slate-400 mt-1.5 px-1">
                    {t('connect.noAccountGoogle')}{' '}
                    <a href="https://ads.google.com/start" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">{t('connect.createGoogle')}</a>
                  </p>
                )}
              </div>

              <div>
                <button
                  onClick={() => handleConnect('meta')}
                  className="w-full flex items-center gap-4 bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md rounded-xl px-5 py-4 transition-all shadow-sm text-left"
                >
                  <MetaIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Meta Ads</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t('connect.metaDesc')}</p>
                  </div>
                  {connected.meta
                    ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold flex-shrink-0">{t('connect.connected')}</span>
                    : <span className="text-xs text-slate-400 flex-shrink-0">{t('connect.connectArrow')}</span>
                  }
                </button>
                {!connected.meta && (
                  <p className="text-xs text-slate-400 mt-1.5 px-1">
                    {t('connect.noAccountGoogle')}{' '}
                    <a href="https://www.facebook.com/business/help/1710077379203657" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">{t('connect.createMeta')}</a>
                    {' '}— {t('connect.metaHelp')}
                  </p>
                )}
              </div>

              <div>
                <button
                  onClick={async () => {
                    if (!tiktokAvailable) {
                      setError(t('connect.tiktokComingSoon'));
                      return;
                    }
                    try {
                      const token = await getClerkToken();
                      window.location.href = `${API_URL}/auth/tiktok?token=${encodeURIComponent(token)}`;
                    } catch {
                      setError(t('connect.sessionError'));
                    }
                  }}
                  className="w-full flex items-center gap-4 bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md rounded-xl px-5 py-4 transition-all shadow-sm text-left"
                >
                  <TikTokIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">TikTok Ads</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t('connect.tiktokDesc')}</p>
                  </div>
                  {connected.tiktok
                    ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold flex-shrink-0">{t('connect.connected')}</span>
                    : <span className="text-xs text-slate-400 flex-shrink-0">{t('connect.connectArrow')}</span>
                  }
                </button>
                {!connected.tiktok && (
                  <p className="text-xs text-slate-400 mt-1.5 px-1">
                    {t('connect.noAccountTikTok')}{' '}
                    <a href="https://ads.tiktok.com/i18n/signup" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">{t('connect.createTikTok')}</a>
                    {' '}— {t('connect.tiktokHelp')}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  {t('connect.termsLabel')}{' '}
                  <a href="/terms" target="_blank" className="text-indigo-600 hover:underline font-semibold">{t('connect.termsToS')}</a>
                  {' · '}
                  <a href="/privacy" target="_blank" className="text-indigo-600 hover:underline font-semibold">{t('connect.termsPrivacy')}</a>
                  {' · '}
                  <a href="/acceptable-use" target="_blank" className="text-indigo-600 hover:underline font-semibold">{t('connect.termsAUP')}</a>
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={e => setMarketingOptIn(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-400">{t('connect.marketingOptIn')}</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasParallelCampaigns}
                  onChange={e => setHasParallelCampaigns(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-400">{t('connect.parallelCampaigns')}</span>
              </label>
            </div>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    await recordOnboardingAttestations();
                    setStep(connected.meta ? 'meta_assets' : 'chat');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not record your consent. Please refresh and try again.');
                  }
                }}
                disabled={!termsAccepted || (!connected.google && !connected.meta && !connected.tiktok)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {(() => {
                  const count = [connected.google, connected.meta, connected.tiktok].filter(Boolean).length;
                  if (count === 0) return t('connect.continueZero');
                  if (count === 1) return t('connect.continueOne');
                  return t('connect.continueMany', { count });
                })()}
              </button>
              <button
                onClick={async () => {
                  try {
                    await recordOnboardingAttestations();
                    setStep('chat');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not record your consent. Please refresh and try again.');
                  }
                }}
                disabled={!termsAccepted}
                className="w-full text-sm text-slate-400 hover:text-slate-600 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('connect.skipLater')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Meta Assets selection (Page + IG + Ad Account) ───────────────────────────
  if (step === 'meta_assets') {
    return <MetaAssetsStep onDone={() => setStep('chat')} onBack={() => setStep('connect')} header={header} />;
  }

  // ── Website describe (shown when website is JS-rendered / unscrapable) ────────
  if (step === 'website_describe' && pendingSettings) {
    const isVigmisSite = /vigmis\.com/i.test(pendingSettings.website_url ?? '');
    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 overflow-y-auto p-6 py-10">
          <div className="max-w-xl mx-auto space-y-5">
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full mb-4 uppercase tracking-wider">
                {t('websiteDescribe.badge')}
              </div>
              <h2 className="text-xl font-bold text-slate-900">{t('websiteDescribe.title')}</h2>
              <p className="text-slate-500 text-sm mt-1">{t('websiteDescribe.subtitle')}</p>
            </div>

            {isVigmisSite && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                {t('websiteDescribe.vigmisNote')}
              </div>
            )}

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">{t('websiteDescribe.label')}</label>
              <textarea
                value={websiteDescription}
                onChange={e => setWebsiteDescription(e.target.value)}
                placeholder={t('websiteDescribe.placeholder')}
                rows={5}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('chat'); setWebsiteDescription(''); }}
                className="border border-slate-200 text-slate-600 text-sm font-semibold px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                {t('websiteDescribe.backToChat')}
              </button>
              <button
                onClick={() => {
                  if (!websiteDescription.trim() || !pendingSettings) return;
                  const updatedSettings = {
                    ...pendingSettings,
                    open_notes: [pendingSettings.open_notes, `Business description (provided manually): ${websiteDescription.trim()}`].filter(Boolean).join('\n'),
                  };
                  runAnalysisFlow(updatedSettings, undefined, true);
                }}
                disabled={!websiteDescription.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {t('websiteDescribe.buildStrategy')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Website check ─────────────────────────────────────────────────────────────
  if (step === 'website_check' && websiteCheck && pendingSettings) {
    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 overflow-y-auto p-6 py-10">
          <div className="max-w-xl mx-auto space-y-5">
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full mb-4 uppercase tracking-wider">
                {t('websiteCheck.badge')}
              </div>
              <h2 className="text-xl font-bold text-slate-900">{t('websiteCheck.title')}</h2>
              <p className="text-slate-500 text-sm mt-1">{t('websiteCheck.subtitle')}</p>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

            {/* What we understood */}
            <div className={`border rounded-xl p-5 space-y-3 ${websiteCheck.adequate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {websiteCheck.adequate ? t('websiteCheck.understood') : t('websiteCheck.incomplete')}
              </p>
              {websiteCheck.summary && (
                <p className="text-sm text-slate-800 leading-relaxed">{websiteCheck.summary}</p>
              )}
              {!websiteCheck.adequate && !websiteCheck.summary && (
                <p className="text-sm text-amber-700">{t('websiteCheck.notEnough')}</p>
              )}
              {websiteCheck.what_they_sell && (
                <div className="grid grid-cols-2 gap-2">
                  {websiteCheck.hero_product && (
                    <div className="bg-white rounded-lg p-3 border border-white/60">
                      <p className="text-xs text-slate-400 mb-0.5">{t('websiteCheck.mainProduct')}</p>
                      <p className="text-sm font-semibold text-slate-800">{websiteCheck.hero_product}</p>
                    </div>
                  )}
                  {websiteCheck.target_audience && (
                    <div className="bg-white rounded-lg p-3 border border-white/60">
                      <p className="text-xs text-slate-400 mb-0.5">{t('websiteCheck.targetAudience')}</p>
                      <p className="text-sm font-semibold text-slate-800">{websiteCheck.target_audience}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Questions from Vigmis */}
            {websiteCheck.unclear.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('websiteCheck.clarifications')}</p>
                <ul className="space-y-1.5">
                  {websiteCheck.unclear.map((q, i) => (
                    <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                      <span className="text-amber-500 font-bold flex-shrink-0 mt-0.5">?</span>
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Client's answer / notes */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">
                {websiteCheck.unclear.length > 0
                  ? t('websiteCheck.yourAnswers')
                  : t('websiteCheck.anythingToAdd')}
              </label>
              <textarea
                value={websiteNotes}
                onChange={e => setWebsiteNotes(e.target.value)}
                placeholder={websiteCheck.unclear.length > 0
                  ? t('websiteCheck.answersPlaceholder')
                  : t('websiteCheck.addPlaceholder')}
                rows={4}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('chat'); setWebsiteCheck(null); setWebsiteNotes(''); }}
                className="border border-slate-200 text-slate-600 text-sm font-semibold px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                {t('websiteCheck.backToChat')}
              </button>
              <button
                onClick={() => runAnalysisFlow(pendingSettings, undefined, true)}
                disabled={websiteCheck.unclear.length > 0 && !websiteNotes.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {websiteCheck.unclear.length > 0 && !websiteNotes.trim()
                  ? t('websiteCheck.answerAbove')
                  : t('websiteCheck.buildStrategy')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Analysis ──────────────────────────────────────────────────────────────────
  if (step === 'analysis') {
    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-10 text-center">
            <div>
              <div className="w-14 h-14 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
              <h2 className="text-xl font-bold text-slate-900">{t('analysis.working')}</h2>
              <p className="text-sm text-slate-500 mt-1">{t('analysis.takes')}</p>
            </div>
            <div className="space-y-4 text-left">
              {ANALYSIS_STEP_KEYS.map((tKey, i) => (
                <div key={ANALYSIS_STEP_IDS[i]} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
                    analysisStep > i ? 'bg-emerald-500 text-white' :
                    analysisStep === i ? 'bg-indigo-600 text-white' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {analysisStep > i ? '✓' : i + 1}
                  </div>
                  <span className={`text-sm font-medium ${analysisStep >= i ? 'text-slate-900' : 'text-slate-400'}`}>
                    {t(tKey)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Strategy ──────────────────────────────────────────────────────────────────
  if (step === 'strategy' && analysisResult && pendingSettings) {
    const { strategy } = analysisResult;
    const managedBudget = Math.round(
      (pendingSettings.budget_monthly_ils / 3.7) * (pendingSettings.management_percentage / 100)
    );

    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 overflow-y-auto p-6 py-8">
          <div className="max-w-xl mx-auto space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('strategy.ready')}</h2>
              <p className="text-slate-500 text-sm mt-1">{t('strategy.basedOn')}</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Strategic narrative */}
            {strategy.strategy_narrative && (
              <div className="bg-slate-900 rounded-xl p-5 space-y-3">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{t('strategy.strategicPlan')}</p>
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{strategy.strategy_narrative}</p>
              </div>
            )}

            {/* Market insights */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 space-y-3">
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">{t('strategy.marketInsights')}</p>
              <p className="text-sm text-slate-800 leading-relaxed">{strategy.market_insights}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border border-indigo-100">
                  <p className="text-xs text-slate-400 font-medium mb-1">{t('strategy.targetAudience')}</p>
                  <p className="text-sm text-slate-800 font-medium leading-snug">{strategy.target_audience}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-indigo-100">
                  <p className="text-xs text-slate-400 font-medium mb-1">{t('strategy.estimatedCPC')}</p>
                  <p className="text-sm text-slate-800 font-bold">{strategy.estimated_cpc}</p>
                </div>
              </div>
            </div>

            {/* Funnel strategy */}
            {strategy.funnel_strategy && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-700">{t('strategy.marketingFunnel')}</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {[
                    { label: t('strategy.awareness'), value: strategy.funnel_strategy.awareness, color: 'bg-violet-500', badge: 'bg-violet-100 text-violet-700' },
                    { label: t('strategy.consideration'), value: strategy.funnel_strategy.consideration, color: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
                    { label: t('strategy.conversion'), value: strategy.funnel_strategy.conversion, color: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
                  ].map(({ label, value, badge }) => (
                    <div key={label} className="px-5 py-4 flex gap-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full h-fit flex-shrink-0 ${badge}`}>{label}</span>
                      <p className="text-sm text-slate-700 leading-relaxed">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Budget allocation */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-semibold text-slate-700">
                  {t('strategy.budgetAllocation')} — <span className="text-indigo-600">${managedBudget}/month</span>
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {(strategy.platforms ?? []).map(platform => {
                  const platformBudget = Math.round((managedBudget * platform.budget_percentage) / 100);
                  return (
                    <div key={platform.name} className="px-5 py-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900 capitalize">{platform.name}</span>
                          {platform.campaign_types.map((t: string) => (
                            <span key={t} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full capitalize">{t}</span>
                          ))}
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <span className="font-bold text-slate-900">${platformBudget}</span>
                          <span className="text-xs text-slate-400 ml-1">({platform.budget_percentage}%)</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div
                          className={`h-1.5 rounded-full ${PLATFORM_BAR[platform.name] ?? 'bg-slate-400'}`}
                          style={{ width: `${platform.budget_percentage}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{platform.reasoning}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Budget advisory */}
            {strategy.budget_analysis && (() => {
              const ba = strategy.budget_analysis;
              const verdictColor = ba.verdict === 'too_low'
                ? 'border-red-200 bg-red-50'
                : ba.verdict === 'exceeds_ceiling'
                ? 'border-amber-200 bg-amber-50'
                : 'border-emerald-200 bg-emerald-50';
              const verdictLabel = ba.verdict === 'too_low'
                ? t('strategy.budgetTooLow')
                : ba.verdict === 'exceeds_ceiling'
                ? t('strategy.budgetCeiling')
                : t('strategy.budgetOk');
              const verdictTextColor = ba.verdict === 'too_low'
                ? 'text-red-700'
                : ba.verdict === 'exceeds_ceiling'
                ? 'text-amber-700'
                : 'text-emerald-700';
              return (
                <div className={`border rounded-xl p-5 space-y-4 ${verdictColor}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('strategy.budgetAdvisory')}</p>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full bg-white ${verdictTextColor}`}>{verdictLabel}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{ba.verdict_explanation}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: t('strategy.minToEnter'), value: `$${ba.minimum_monthly_usd}/mo` },
                      { label: t('strategy.recLearning'), value: `$${ba.recommended_learning_usd}/mo` },
                      { label: t('strategy.recOngoing'), value: `$${ba.recommended_steady_usd}/mo` },
                      { label: t('strategy.ceiling'), value: `$${ba.efficiency_ceiling_usd}/mo` },
                    ].map(item => (
                      <div key={item.label} className="bg-white rounded-lg p-3 border border-white/60">
                        <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
                        <p className="text-sm font-bold text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    {[
                      { label: t('strategy.estClicks'), value: ba.projected_clicks_monthly.toLocaleString() },
                      { label: t('strategy.estLeads'), value: ba.projected_leads_monthly.toLocaleString() },
                      { label: t('strategy.breakEven'), value: `${ba.break_even_conversions}` },
                    ].map(item => (
                      <div key={item.label} className="bg-white rounded-lg p-3 border border-white/60">
                        <p className="text-sm font-black text-slate-900">{item.value}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>

                  {ba.warnings?.length > 0 && (
                    <div className="space-y-1.5">
                      {ba.warnings.map((w: string, i: number) => (
                        <p key={i} className="text-xs text-slate-600 leading-relaxed">⚠ {w}</p>
                      ))}
                    </div>
                  )}

                  {ba.platform_exclusions?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-500">{t('strategy.platformsNotRec')}</p>
                      {ba.platform_exclusions.map((e: any) => (
                        <p key={e.platform} className="text-xs text-slate-500 capitalize">✕ <strong>{e.platform}</strong> — {e.reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Recommendations */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t('strategy.paidRecs')}</p>
              <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{strategy.recommendations}</p>
            </div>

            {/* Past performance notes */}
            {strategy.past_performance_notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
                <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">{t('strategy.learnings')}</p>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{strategy.past_performance_notes}</p>
              </div>
            )}

            {/* Creative brief per platform */}
            {strategy.creative_brief && strategy.creative_brief.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <p className="text-sm font-semibold text-slate-700">{t('strategy.creativeBrief')}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t('strategy.creativeBriefSub')}</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {strategy.creative_brief.map((brief: any) => (
                    <div key={brief.platform} className="px-5 py-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-900 capitalize">{brief.platform}</span>
                        <div className="flex gap-1.5">
                          {brief.formats.map((f: string) => (
                            <span key={f} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{f.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-slate-400 mb-1">{t('strategy.creativesToProduce')}</p>
                          <p className="font-semibold text-slate-700">{brief.quantity_images} image{brief.quantity_images !== 1 ? 's' : ''}{brief.quantity_videos > 0 ? ` · ${brief.quantity_videos} video${brief.quantity_videos !== 1 ? 's' : ''}` : ''}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <p className="text-slate-400 mb-1">{t('strategy.cta')}</p>
                          <p className="font-semibold text-slate-700">{brief.cta}</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500">{t('strategy.messageAngles')}</p>
                        {brief.hooks.map((hook: string, i: number) => (
                          <p key={i} className="text-xs text-slate-600 leading-relaxed pl-2 border-l-2 border-indigo-200">{hook}</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing platform suggestions */}
            {strategy.missing_platforms && strategy.missing_platforms.length > 0 && (
              <div className="border-2 border-amber-200 bg-amber-50 rounded-xl p-5 space-y-3">
                <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">{t('strategy.platformOpportunities')}</p>
                <p className="text-xs text-amber-700">{t('strategy.recPlatforms')}</p>
                {strategy.missing_platforms.map((mp: any) => (
                  <div key={mp.platform} className="bg-white rounded-lg p-3.5 border border-amber-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900 capitalize">{mp.platform}</span>
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{t('strategy.notConnected')}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{mp.reason}</p>
                    <p className="text-xs text-emerald-700 font-medium mt-1.5">Potential: {mp.potential_uplift}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Organic recommendations */}
            {strategy.organic_recommendations && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">{t('strategy.organic')}</p>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{strategy.organic_recommendations}</p>
                <p className="text-xs text-slate-400 mt-3">{t('strategy.organicSub')}</p>
              </div>
            )}

            {/* Social Media Management opt-in */}
            {(() => {
              const sp = strategy.social_plan;
              if (!sp) return null;
              const allPlatforms: ('facebook' | 'instagram' | 'tiktok')[] = ['facebook', 'instagram', 'tiktok'];
              const platformCost: Record<string, number> = { facebook: 1, instagram: 1, tiktok: 3 };
              const estimatedCost = socialEnabled
                ? socialPlatforms.reduce((s, p) => s + (platformCost[p] ?? 1) * 4, 0)
                : 0;
              return (
                <div className={`border-2 rounded-xl overflow-hidden transition-all ${socialEnabled ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'}`}>
                  <div className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-900">{t('strategy.socialManagement')}</p>
                        {sp.recommended && (
                          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">{t('strategy.aiRecommended')}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{sp.rationale}</p>
                      {sp.synergy_with_ads && (
                        <p className="text-xs text-violet-600 mt-1 leading-relaxed">{sp.synergy_with_ads}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setSocialEnabled(v => !v)}
                      className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${socialEnabled ? 'bg-violet-600' : 'bg-slate-200'}`}
                      aria-label="Toggle social media management"
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${socialEnabled ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>

                  {socialEnabled && (
                    <div className="border-t border-violet-200 px-5 py-4 space-y-4">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('strategy.selectPlatforms')}</p>
                        <div className="flex gap-2 flex-wrap">
                          {allPlatforms.map(p => {
                            const on = socialPlatforms.includes(p);
                            return (
                              <button
                                key={p}
                                onClick={() => setSocialPlatforms(prev =>
                                  on ? prev.filter(x => x !== p) : [...prev, p]
                                )}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                              >
                                {p} {on ? `· $${platformCost[p]}/post` : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('strategy.approvalMode')}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {([
                            { value: 'auto', label: t('strategy.approvalAuto'), desc: t('strategy.approvalAutoDesc') },
                            { value: 'review', label: t('strategy.approvalReview'), desc: t('strategy.approvalReviewDesc') },
                            { value: 'strict', label: t('strategy.approvalStrict'), desc: t('strategy.approvalStrictDesc') },
                          ] as const).map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => setSocialApprovalMode(opt.value)}
                              className={`border rounded-xl px-3 py-2.5 text-left transition-all ${socialApprovalMode === opt.value ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                              <p className={`text-xs font-bold ${socialApprovalMode === opt.value ? 'text-violet-700' : 'text-slate-700'}`}>{opt.label}</p>
                              <p className="text-xs text-slate-400 mt-0.5 leading-snug">{opt.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white border border-violet-100 rounded-xl p-3 flex items-center justify-between">
                        <p className="text-xs text-slate-500">{t('strategy.estimatedCost')}</p>
                        <p className="text-sm font-bold text-violet-700">~${estimatedCost}/mo</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Feedback / discussion / CTA */}
            {showFeedback ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t('strategy.whatToChange')}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t('strategy.vigmisOpinion')}</p>
                </div>

                <textarea
                  value={strategyFeedback}
                  onChange={e => { setStrategyFeedback(e.target.value); setDiscussionResponse(null); }}
                  placeholder={t('strategy.feedbackPlaceholder')}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />

                {/* Vigmis's discussion response */}
                {discussionResponse && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">{t('strategy.vigmisTake')}</p>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{discussionResponse}</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setDiscussionResponse(null); setStrategyFeedback(''); }}
                        className="flex-1 border border-slate-200 text-slate-600 text-xs font-semibold py-2 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        {t('strategy.modifyRequest')}
                      </button>
                      <button
                        onClick={handleRevise}
                        disabled={isRevising}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
                      >
                        {isRevising ? t('strategy.updating') : t('strategy.proceedDecision')}
                      </button>
                    </div>
                  </div>
                )}

                {!discussionResponse && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowFeedback(false); setStrategyFeedback(''); setDiscussionResponse(null); }}
                      className="flex-1 border border-slate-200 text-slate-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!strategyFeedback.trim() || !pendingSettings || !analysisResult) return;
                        setIsDiscussing(true);
                        try {
                          const opinion = await discussStrategy(analysisResult.strategy, strategyFeedback, pendingSettings);
                          setDiscussionResponse(opinion);
                        } catch {
                          setDiscussionResponse("I couldn't generate a response right now. You can proceed with your changes directly.");
                        } finally {
                          setIsDiscussing(false);
                        }
                      }}
                      disabled={!strategyFeedback.trim() || isDiscussing}
                      className="flex-1 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                    >
                      {isDiscussing ? t('strategy.thinking') : t('strategy.getOpinion')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Campaign Plan Summary — shown before approval */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-900 px-5 py-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('strategy.summaryTitle')}</p>
                    <p className="text-white font-bold text-base mt-0.5">{t('strategy.summaryReady')}</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {/* Platforms & budget */}
                    <div className="px-5 py-4 space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('strategy.platformsBudget')}</p>
                      {strategy.platforms.map((p: any) => {
                        const amt = Math.round((managedBudget * p.budget_percentage) / 100);
                        return (
                          <div key={p.name} className="flex items-center justify-between">
                            <span className="text-sm text-slate-700 capitalize font-medium">{p.name} — {p.campaign_types.join(', ')}</span>
                            <span className="text-sm font-bold text-slate-900">${amt}/mo ({p.budget_percentage}%)</span>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-sm font-bold text-slate-700">{t('strategy.totalManaged')}</span>
                        <span className="text-sm font-black text-indigo-600">${managedBudget}/mo</span>
                      </div>
                    </div>
                    {/* Budget decision */}
                    {strategy.budget_analysis && (
                      <div className="px-5 py-4 space-y-1">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('strategy.budgetDecision')}</p>
                        <p className="text-sm text-slate-700">{strategy.budget_analysis.verdict_explanation}</p>
                        <div className="flex gap-4 pt-1">
                          <span className="text-xs text-slate-400">{t('strategy.estClicksLabel')} <strong className="text-slate-700">{strategy.budget_analysis.projected_clicks_monthly.toLocaleString()}/mo</strong></span>
                          <span className="text-xs text-slate-400">{t('strategy.estLeadsLabel')} <strong className="text-slate-700">{strategy.budget_analysis.projected_leads_monthly.toLocaleString()}/mo</strong></span>
                          <span className="text-xs text-slate-400">{t('strategy.breakEvenLabel')} <strong className="text-slate-700">{strategy.budget_analysis.break_even_conversions} sales</strong></span>
                        </div>
                      </div>
                    )}
                    {/* Goal */}
                    <div className="px-5 py-4 flex justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider self-center">{t('strategy.goal')}</span>
                      <span className="text-sm font-semibold text-slate-700 capitalize">{pendingSettings.goal}</span>
                    </div>
                    {/* Target */}
                    <div className="px-5 py-4 flex justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider self-center">{t('strategy.targetMarket')}</span>
                      <span className="text-sm font-semibold text-slate-700">{(pendingSettings.geo_include ?? []).join(', ')}</span>
                    </div>
                    {/* Learning period */}
                    <div className="px-5 py-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{t('strategy.timeline')}</p>
                      <p className="text-xs text-slate-500">{t('strategy.timelineDay1')}</p>
                      <p className="text-xs text-slate-500 mt-1">{t('strategy.timelineDay8')}</p>
                    </div>
                  </div>
                </div>

                {/* Proactive check-in before approval — every decision point gets this */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 text-sm">{t('strategy.beforeApprove')}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{t('strategy.beforeApproveDesc')}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={strategyFeedback}
                      onChange={e => setStrategyFeedback(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && strategyFeedback.trim()) { setShowFeedback(true); setDiscussionResponse(null); } }}
                      placeholder={t('strategy.askPlaceholder')}
                      className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      dir="auto"
                    />
                    <button
                      onClick={() => { if (strategyFeedback.trim()) { setShowFeedback(true); setDiscussionResponse(null); } }}
                      disabled={!strategyFeedback.trim()}
                      className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex-shrink-0"
                    >
                      {t('strategy.ask')}
                    </button>
                  </div>
                </div>

                {/* Formal approval */}
                <div className="border-2 border-indigo-200 bg-indigo-50 rounded-2xl p-5 space-y-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={planApproved}
                      onChange={e => setPlanApproved(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                    />
                    <span className="text-xs text-slate-700 leading-relaxed">
                      {t('strategy.approveConfirm', { budget: `$${managedBudget}` })}
                    </span>
                  </label>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep('creative')}
                      disabled={!planApproved}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
                    >
                      {t('strategy.approveContinue')}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              onClick={() => setStep('chat')}
              className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors py-1"
            >
              {t('strategy.backToDetails')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Creative ──────────────────────────────────────────────────────────────────
  if (step === 'creative') {
    const videoOptions = [
      {
        type: 'avatar' as const,
        title: t('creative.avatar'),
        subtitle: t('creative.avatarDesc'),
        price: '$15',
        bestFor: t('creative.avatarBestFor'),
        recommended: true,
        icon: '🎙️',
      },
      {
        type: 'cinematic' as const,
        title: t('creative.cinematic'),
        subtitle: t('creative.cinematicDesc'),
        price: '$12',
        bestFor: t('creative.cinematicBestFor'),
        recommended: false,
        icon: '🎬',
      },
      {
        type: 'animation' as const,
        title: t('creative.animation'),
        subtitle: t('creative.animationDesc'),
        price: '$8',
        bestFor: t('creative.animationBestFor'),
        recommended: false,
        icon: '✨',
      },
    ];

    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 overflow-y-auto p-6 py-8">
          <div className="max-w-xl mx-auto space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('creative.title')}</h2>
              <p className="text-slate-500 text-sm mt-1">
                {t('creative.subtitle')}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">{t('creative.aiRec')}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{t('creative.aiRecText')}</p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">{t('creative.aiGenerated')}</p>
              {videoOptions.map(opt => (
                <button
                  key={opt.type}
                  onClick={() => setCreativeChoice(opt.type)}
                  className={`w-full flex items-center gap-4 rounded-xl px-5 py-4 border-2 text-left transition-all ${
                    creativeChoice === opt.type
                      ? 'border-indigo-600 bg-indigo-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{opt.title}</span>
                      {opt.recommended && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">{t('creative.recommended')}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.subtitle}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t('creative.bestFor')} {opt.bestFor}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900">{opt.price}</p>
                    <p className="text-xs text-slate-400">{t('creative.perVideo')}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-4">
              <button
                onClick={() => setCreativeChoice('upload')}
                className={`w-full flex items-center gap-4 rounded-xl px-5 py-4 border-2 text-left transition-all ${
                  creativeChoice === 'upload'
                    ? 'border-indigo-600 bg-indigo-50'
                    : 'border-dashed border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <span className="text-2xl flex-shrink-0">📁</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t('creative.ownCreative')}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t('creative.ownCreativeDesc')}</p>
                </div>
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleCreativeDone('skip')}
                className="flex-1 border border-slate-200 text-slate-500 text-sm font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                {t('creative.skipForNow')}
              </button>
              <button
                onClick={() => creativeChoice && handleCreativeDone(creativeChoice)}
                disabled={!creativeChoice}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {t('creative.continue')}
              </button>
            </div>

            <p className="text-xs text-center text-slate-400">
              {t('creative.canChange')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Tracking Setup ────────────────────────────────────────────────────────────
  if (step === 'tracking') {
    const isEcommerce = pendingSettings?.goal === 'purchases' ||
      pendingSettings?.business_type === 'ecommerce' ||
      pendingSettings?.business_type === 'hero_product';

    const platformInstructions: Record<string, { title: string; steps: string[] }> = {
      shopify: { title: 'Shopify', steps: ['Online Store → Themes → Edit Code', 'Open theme.liquid', 'Paste before </head>', 'Save'] },
      wordpress: { title: 'WordPress', steps: ['Plugins → Add New → "Insert Headers and Footers"', 'Paste in Header Scripts', 'Save'] },
      wix: { title: 'Wix', steps: ['Settings → Custom Code', 'Add Code → Head', 'Paste and Save'] },
      squarespace: { title: 'Squarespace', steps: ['Settings → Advanced → Code Injection', 'Paste in Header', 'Save'] },
      webflow: { title: 'Webflow', steps: ['Project Settings → Custom Code → Head Code', 'Paste and Publish'] },
      other: { title: 'Other platforms', steps: ['Find your theme/template HTML file', 'Paste before </head> tag', 'Save and republish'] },
    };
    type PlatformKey = keyof typeof platformInstructions;

    async function handleCopySnippet() {
      if (!pixelSnippet) return;
      await navigator.clipboard.writeText(pixelSnippet.snippet).catch(() => null);
      setPixelCopied(true);
      setTimeout(() => setPixelCopied(false), 2500);
    }

    async function handleVerifyPixel() {
      setPixelVerifying(true);
      const result = await verifyPixel();
      setPixelVerifying(false);
      if (result.verified) {
        setPixelVerified(true);
      } else {
        setError(result.message ?? 'No pixel events detected yet. Make sure the snippet is on every page.');
      }
    }

    async function handleShopifyConnect() {
      if (!shopifyDomain.trim()) return;
      setShopifyConnecting(true);
      const result = await startShopifyConnect(shopifyDomain.trim());
      setShopifyConnecting(false);
      if (result.auth_url) {
        window.location.href = result.auth_url;
      } else {
        setError(result.error ?? 'Failed to start Shopify connection');
      }
    }

    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 overflow-y-auto p-6 py-8">
          <div className="max-w-xl mx-auto space-y-5">
            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full mb-4 uppercase tracking-wider">
                {t('tracking.badge')}
              </div>
              <h2 className="text-2xl font-bold text-slate-900">{t('tracking.title')}</h2>
              <p className="text-slate-500 text-sm mt-1">{t('tracking.subtitle')}</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Why this matters */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">{t('tracking.whyMatters')}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{t('tracking.whyText')}</p>
              {pendingSettings?.margin_pct && (
                <p className="text-sm text-slate-700 leading-relaxed">
                  With your {pendingSettings.margin_pct}% margin, Vigmis will show your <strong>actual profit per campaign</strong>, not just revenue.
                </p>
              )}
            </div>

            {/* Pixel snippet */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{t('tracking.step1')}</p>
                <span className="text-xs text-slate-400">{t('tracking.beforeHead')}</span>
              </div>
              <div className="p-4">
                {pixelSnippet ? (
                  <div className="space-y-3">
                    <pre className="bg-slate-900 text-emerald-400 text-xs p-4 rounded-xl overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                      {pixelSnippet.snippet}
                    </pre>
                    <button
                      onClick={handleCopySnippet}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        pixelCopied
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      {pixelCopied ? t('tracking.copied') : t('tracking.copySnippet')}
                    </button>

                    {/* Platform installation instructions */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-xs font-semibold text-slate-600">Where do you want to install it?</p>
                      </div>
                      <div className="p-3 grid grid-cols-3 gap-2">
                        {(Object.keys(platformInstructions) as PlatformKey[]).map((key) => (
                          <button
                            key={key}
                            onClick={() => setSelectedPlatform(selectedPlatform === key ? null : key)}
                            className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all text-center ${
                              selectedPlatform === key
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                            }`}
                          >
                            {platformInstructions[key].title}
                          </button>
                        ))}
                      </div>
                      {selectedPlatform && (
                        <div className="px-4 pb-4 space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            How to install on {platformInstructions[selectedPlatform as PlatformKey].title}
                          </p>
                          <ol className="space-y-1.5">
                            {platformInstructions[selectedPlatform as PlatformKey].steps.map((step, i) => (
                              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                                  {i + 1}
                                </span>
                                {step}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>

                    {/* Trust note */}
                    <div className="flex items-start gap-2.5 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                      <svg className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        This code is safe — it only tracks page visits, does not access your data, and does not slow your site.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-sm">{t('tracking.loadingSnippet')}</div>
                )}
              </div>
            </div>

            {/* Verify installation */}
            <div className={`border rounded-xl p-5 space-y-3 ${pixelVerified ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'} shadow-sm`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">{t('tracking.step2')}</p>
                {pixelVerified && <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full">{t('tracking.verified')}</span>}
              </div>
              {pixelVerified ? (
                <p className="text-sm text-emerald-700">{t('tracking.pixelFiring')}</p>
              ) : (
                <>
                  <p className="text-xs text-slate-500 leading-relaxed">{t('tracking.afterPasting')}</p>
                  <button
                    onClick={handleVerifyPixel}
                    disabled={pixelVerifying || !pixelSnippet}
                    className="w-full border border-indigo-200 text-indigo-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-50 disabled:opacity-40 transition-colors"
                  >
                    {pixelVerifying ? t('tracking.checking') : t('tracking.checkPixel')}
                  </button>
                </>
              )}
            </div>

            {/* Shopify connect (for ecommerce) */}
            {isEcommerce && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-700">{t('tracking.shopifyStep')}</p>
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">{t('tracking.shopifyRec')}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{t('tracking.shopifyDesc')}</p>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed">{t('tracking.shopifyDetails')}</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shopifyDomain}
                      onChange={e => setShopifyDomain(e.target.value)}
                      placeholder={t('tracking.shopifyPlaceholder')}
                      className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleShopifyConnect}
                      disabled={!shopifyDomain.trim() || shopifyConnecting}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex-shrink-0"
                    >
                      {shopifyConnecting ? t('tracking.connecting') : t('tracking.connectShopify')}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">{t('tracking.wooCommerce')}</p>
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleTrackingDone(true)}
                className="flex-1 border border-slate-200 text-slate-500 text-sm font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                {t('tracking.skipForNow')}
              </button>
              <button
                onClick={() => handleTrackingDone(false)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {pixelVerified ? t('tracking.launchCampaigns') : t('tracking.installedPixel')}
              </button>
            </div>

            {!pixelVerified && (
              <p className="text-xs text-center text-slate-400">{t('tracking.installLater')}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Saving ────────────────────────────────────────────────────────────────────
  if (step === 'saving') {
    return (
      <div className="flex flex-col flex-1">
        {header}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-[3px] border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <div>
              <p className="font-semibold text-slate-900">{t('saving.title')}</p>
              <p className="text-sm text-slate-500 mt-1">{t('saving.subtitle')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat ──────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {header}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2.5 text-sm text-red-700 flex-shrink-0">
          {error}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <OnboardingChat onConfirm={handleChatConfirm} />
      </div>
    </div>
  );
}

// ── Meta Assets step ──────────────────────────────────────────────────────────
// Shown immediately after Meta OAuth completes. Forces the client to pick which
// Ad Account, Facebook Page, and Instagram Business account Vigmis will manage,
// before they go any deeper into onboarding. Eliminates the silent "first
// account Meta returns" fallback.

function MetaAssetsStep({ onDone, onBack, header }: { onDone: () => void; onBack: () => void; header: React.ReactNode }) {
  const t = useTranslations('onboarding.metaAssets');
  const [pages, setPages] = useState<MetaPage[] | null>(null);
  const [accounts, setAccounts] = useState<MetaAdAccount[] | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedIgUserId, setSelectedIgUserId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [pagesRes, accountsRes] = await Promise.all([getMetaPages(), getMetaAdAccounts()]);
      if (pagesRes) {
        setPages(pagesRes.pages);
        setSelectedPageId(pagesRes.selected_page_id);
        setSelectedIgUserId(pagesRes.selected_instagram_user_id);
      } else {
        setError('Could not load Facebook pages — please reconnect Meta.');
      }
      if (accountsRes) {
        setAccounts(accountsRes.accounts);
        setSelectedAccountId(accountsRes.selected);
      }
      setLoading(false);
    })();
  }, []);

  function selectPage(p: MetaPage) {
    setSelectedPageId(p.page_id);
    setSelectedIgUserId(p.instagram_user_id);
  }

  async function handleContinue() {
    if (!selectedAccountId) { setError('Please choose an Ad Account first.'); return; }
    setSaving(true);
    setError(null);
    const promises: Promise<any>[] = [selectMetaAdAccount(selectedAccountId)];
    if (selectedPageId) promises.push(selectMetaPage(selectedPageId, selectedIgUserId));
    const [accountRes] = await Promise.all(promises);
    setSaving(false);
    if (!accountRes?.success) {
      setError('Failed to save your selection. Please try again.');
      return;
    }
    onDone();
  }

  return (
    <div className="flex flex-col flex-1">
      {header}
      <div className="flex-1 overflow-y-auto p-6 py-10">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t('title')}</h2>
            <p className="text-slate-500 text-sm mt-1">{t('subtitle')}</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}

          {loading && (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
          )}

          {!loading && (
            <>
              {/* Facebook Page + IG */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-bold text-slate-900">{t('facebookPage')} <span className="text-xs font-normal text-slate-400">— {t('facebookPageOptional')}</span></h3>
                  <span className="text-xs text-slate-400">{pages?.length ?? 0} {t('available')}</span>
                </div>
                <p className="text-xs text-slate-500">{t('instagramNote')}</p>
                {pages && pages.length === 0 && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    {t('noPages')}
                  </p>
                )}
                <div className="space-y-2">
                  {pages?.map(p => {
                    const isSelected = p.page_id === selectedPageId;
                    return (
                      <button
                        key={p.page_id}
                        onClick={() => selectPage(p)}
                        className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                          isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                            <p className="text-xs text-slate-500 font-mono mt-0.5">{p.page_id}</p>
                            {p.category && <p className="text-xs text-slate-500 mt-0.5">{p.category}</p>}
                            {p.instagram_username ? (
                              <p className="text-xs text-violet-600 mt-1">📷 Instagram: @{p.instagram_username}</p>
                            ) : (
                              <p className="text-xs text-slate-400 mt-1">{t('noInstagram')}</p>
                            )}
                          </div>
                          {isSelected && (
                            <span className="text-xs bg-emerald-500 text-white px-2.5 py-1 rounded-full font-bold flex-shrink-0">{t('selected')}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ad Account */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-bold text-slate-900">{t('adAccount')} <span className="text-xs font-normal text-slate-400">— {t('adAccountRequired')}</span></h3>
                  <span className="text-xs text-slate-400">{accounts?.length ?? 0} {t('available')}</span>
                </div>
                {accounts && accounts.length === 0 && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    {t('noAdAccounts')}
                  </p>
                )}
                <div className="space-y-2">
                  {accounts?.map(a => {
                    const isSelected = a.id === selectedAccountId;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAccountId(a.id)}
                        className={`w-full text-left border rounded-xl px-4 py-3 transition-all ${
                          isSelected ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{a.name}</p>
                            <p className="text-xs text-slate-500 font-mono mt-0.5">{a.id}</p>
                            <div className="flex gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                              {a.business && <span>Business: <strong className="text-slate-700">{a.business}</strong></span>}
                              {a.currency && <span>Currency: <strong className="text-slate-700">{a.currency}</strong></span>}
                              <span>{a.active ? t('active') : t('inactive')}</span>
                            </div>
                          </div>
                          {isSelected && (
                            <span className="text-xs bg-emerald-500 text-white px-2.5 py-1 rounded-full font-bold flex-shrink-0">{t('selected')}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onBack}
                  className="border border-slate-200 text-slate-600 text-sm font-semibold px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  {t('back')}
                </button>
                <button
                  onClick={handleContinue}
                  disabled={saving || !selectedAccountId}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
                >
                  {saving ? t('saving') : t('continue')}
                </button>
              </div>
              <p className="text-xs text-slate-400 text-center">
                {t('changeNote')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function MetaIcon() {
  return (
    <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.27 8.27 0 004.84 1.55V6.79a4.85 4.85 0 01-1.07-.1z"/>
    </svg>
  );
}

async function getClerkToken(): Promise<string> {
  const { Clerk } = window as any;
  if (!Clerk) throw new Error('Clerk not loaded');
  const token = await Clerk.session?.getToken();
  if (!token) throw new Error('Not authenticated — please sign in again');
  return token;
}
