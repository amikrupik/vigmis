'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import OnboardingChat from '../components/OnboardingChat';
import ChatDrawer from '../dashboard/ChatDrawer';
import type { OnboardingSettings, AnalysisResult, WebsiteCheck, TrackingStatus, PixelSnippet } from './actions';
import { runAnalysis, discussStrategy, checkWebsite, getPixelSnippet, verifyPixel, startShopifyConnect } from './actions';
import type { ConversationMessage, StrategyPlan } from '@vigmis/db';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Step = 'connect' | 'chat' | 'analysis' | 'website_check' | 'strategy' | 'creative' | 'tracking' | 'saving';
type CreativeChoice = 'avatar' | 'cinematic' | 'animation' | 'upload' | 'skip' | null;

const STEPS: { key: Step; label: string }[] = [
  { key: 'connect', label: 'Connect' },
  { key: 'chat', label: 'Interview' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'creative', label: 'Creative' },
  { key: 'tracking', label: 'Tracking' },
];

const STEP_INDEX: Record<Step, number> = {
  connect: 0, chat: 1, analysis: 2, website_check: 2, strategy: 3, creative: 4, tracking: 5, saving: 6,
};

const ANALYSIS_STEPS = [
  { key: 'website', label: 'Scanning your website...' },
  { key: 'research', label: 'Researching your market...' },
  { key: 'strategy', label: 'Building your campaign plan...' },
];

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_denied: 'Google connection canceled',
  google_failed: 'Google connection failed — please try again',
  meta_denied: 'Meta connection canceled',
  meta_failed: 'Meta connection failed — please try again',
  tiktok_denied: 'TikTok connection canceled',
  tiktok_failed: 'TikTok connection failed — please try again',
  tiktok_not_configured: 'TikTok integration is not yet active — coming soon',
  invalid_state: 'Security error — please try again',
};

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

export default function OnboardingPageClient({ initialConnected, initialError, rethinkMode }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('connect');
  const [showRethinkWarning, setShowRethinkWarning] = useState(rethinkMode === true);
  const [connected, setConnected] = useState({
    google: initialConnected === 'google',
    meta: initialConnected === 'meta',
    tiktok: initialConnected === 'tiktok',
  });
  const [error, setError] = useState<string | null>(
    initialError ? (OAUTH_ERROR_MESSAGES[initialError] ?? 'Connection error') : null,
  );
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
  const [pixelSnippet, setPixelSnippet] = useState<PixelSnippet | null>(null);
  const [pixelCopied, setPixelCopied] = useState(false);
  const [pixelVerifying, setPixelVerifying] = useState(false);
  const [pixelVerified, setPixelVerified] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [shopifyConnecting, setShopifyConnecting] = useState(false);

  async function handleConnect(platform: 'google' | 'meta') {
    try {
      const token = await getClerkToken();
      window.location.href = `${API_URL}/auth/${platform}?token=${encodeURIComponent(token)}`;
    } catch {
      setError('Session error — please refresh the page');
    }
  }

  async function handleChatConfirm(settings: OnboardingSettings, conversation: ConversationMessage[]) {
    setPendingSettings(settings);
    setPendingConversation(conversation);
    await runAnalysisFlow(settings);
  }

  async function runAnalysisFlow(settings: OnboardingSettings, feedback?: string, skipWebsiteCheck = false) {
    setStep('analysis');
    setAnalysisStep(0);
    try {
      // Phase 1: Quick website understanding (skip on re-runs / feedback revisions)
      if (!skipWebsiteCheck && settings.website_url && !feedback) {
        const check = await checkWebsite(settings.website_url);
        setWebsiteCheck(check);
        // If unclear or inadequate — pause and show the check to the user
        if (!check.adequate || check.unclear.length > 0) {
          setStep('website_check');
          return;
        }
        // If adequate with no questions — continue directly with notes from check
      }

      // Phase 2: Full strategy analysis
      const timer1 = setTimeout(() => setAnalysisStep(1), 1500);
      const timer2 = setTimeout(() => setAnalysisStep(2), 4000);
      const settingsWithNotes = websiteNotes.trim()
        ? { ...settings, open_notes: [settings.open_notes, `Website clarification: ${websiteNotes.trim()}`].filter(Boolean).join('\n') }
        : settings;
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Analysis is taking longer than expected. Please try again.')), 60_000)
      );
      const result = await Promise.race([runAnalysis(settingsWithNotes, feedback), timeout]);
      clearTimeout(timer1);
      clearTimeout(timer2);
      setAnalysisStep(3);
      await new Promise(r => setTimeout(r, 500));
      setAnalysisResult(result);
      setStep('strategy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
      setStep('chat');
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
    if (!pendingSettings || !analysisResult) return;
    setStep('saving');
    setError(null);
    try {
      const token = await getClerkToken();
      const res = await fetch(`${API_URL}/onboarding/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...pendingSettings,
          has_parallel_campaigns: hasParallelCampaigns,
          conversation: pendingConversation,
          strategy_plan: analysisResult.strategy,
          creative_choice: creativeChoice,
          tracking_verified: pixelVerified && !skipTracking,
          social_opt_in: socialEnabled ? {
            enabled: true,
            platforms: socialPlatforms,
            approval_mode: socialApprovalMode,
            content_pillars: analysisResult.strategy.social_plan?.content_pillars,
          } : undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setStep('tracking');
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────────
  const header = (
    <header className="border-b border-slate-200 bg-white px-6 py-4 flex-shrink-0">
      <div className="max-w-2xl mx-auto flex items-center gap-6">
        <Image src="/logo_nav.png" alt="Vigmis" width={200} height={44} priority className="flex-shrink-0" />
        <div className="flex-1 flex items-center min-w-0">
          {STEPS.map((s, i) => (
            <Fragment key={s.key}>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                  STEP_INDEX[step] > i
                    ? 'bg-emerald-500 text-white'
                    : STEP_INDEX[step] === i
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  {STEP_INDEX[step] > i ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium hidden md:block ${
                  STEP_INDEX[step] > i ? 'text-emerald-600' :
                  STEP_INDEX[step] === i ? 'text-indigo-600' :
                  'text-slate-400'
                }`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 min-w-[8px] ${STEP_INDEX[step] > i ? 'bg-emerald-300' : 'bg-slate-200'}`} />
              )}
            </Fragment>
          ))}
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
              <h1 className="text-2xl font-bold text-slate-900">Connect your ad accounts</h1>
              <p className="text-slate-500 text-sm mt-2">
                Vigmis needs access to manage your campaigns. Connect at least one platform to continue.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-3">
              <div>
                <button
                  onClick={() => handleConnect('google')}
                  className="w-full flex items-center gap-4 bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md rounded-xl px-5 py-4 transition-all shadow-sm text-left"
                >
                  <GoogleIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Google Ads</p>
                    <p className="text-xs text-slate-400 mt-0.5">Search, Display, Performance Max</p>
                  </div>
                  {connected.google
                    ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold flex-shrink-0">Connected ✓</span>
                    : <span className="text-xs text-slate-400 flex-shrink-0">Connect →</span>
                  }
                </button>
                {!connected.google && (
                  <p className="text-xs text-slate-400 mt-1.5 px-1">
                    No account yet?{' '}
                    <a href="https://ads.google.com/start" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Create a Google Ads account →</a>
                    {' '}— then come back and connect. Need help? Use the chat button below.
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
                    <p className="text-xs text-slate-400 mt-0.5">Facebook, Instagram, Reels</p>
                  </div>
                  {connected.meta
                    ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold flex-shrink-0">Connected ✓</span>
                    : <span className="text-xs text-slate-400 flex-shrink-0">Connect →</span>
                  }
                </button>
                {!connected.meta && (
                  <p className="text-xs text-slate-400 mt-1.5 px-1">
                    No account yet?{' '}
                    <a href="https://www.facebook.com/business/help/1710077379203657" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Create a Meta Business account →</a>
                    {' '}— then come back and connect. Need help? Use the chat button below.
                  </p>
                )}
              </div>

              <div>
                <button
                  onClick={async () => {
                    try {
                      const token = await getClerkToken();
                      window.location.href = `${API_URL}/auth/tiktok?token=${encodeURIComponent(token)}`;
                    } catch {
                      setError('Session error — please refresh the page');
                    }
                  }}
                  className="w-full flex items-center gap-4 bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md rounded-xl px-5 py-4 transition-all shadow-sm text-left"
                >
                  <TikTokIcon />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">TikTok Ads</p>
                    <p className="text-xs text-slate-400 mt-0.5">TikTok for Business — In-Feed, Spark, TopView</p>
                  </div>
                  {connected.tiktok
                    ? <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold flex-shrink-0">Connected ✓</span>
                    : <span className="text-xs text-slate-400 flex-shrink-0">Connect →</span>
                  }
                </button>
                {!connected.tiktok && (
                  <p className="text-xs text-slate-400 mt-1.5 px-1">
                    No account yet?{' '}
                    <a href="https://ads.tiktok.com/i18n/signup" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline">Create a TikTok for Business account →</a>
                    {' '}— then come back and connect. Need help? Use the chat button below.
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
                  By continuing, I agree to Vigmis&apos;s{' '}
                  <a href="/terms" target="_blank" className="text-indigo-600 hover:underline font-semibold">Terms of Service</a>
                  {', '}
                  <a href="/privacy" target="_blank" className="text-indigo-600 hover:underline font-semibold">Privacy Policy</a>
                  {', and '}
                  <a href="/acceptable-use" target="_blank" className="text-indigo-600 hover:underline font-semibold">Acceptable Use Policy</a>
                  {' '}(including the AI system limitations described therein). I confirm I am 18 or older.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={e => setMarketingOptIn(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-400">Send me tips and product updates by email. (Optional)</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasParallelCampaigns}
                  onChange={e => setHasParallelCampaigns(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-400">
                  I have active campaigns on these platforms that I am <strong>not</strong> transferring to Vigmis.
                  <span className="ml-1">(Helps calibrate benchmarks.)</span>
                </span>
              </label>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep('chat')}
                disabled={!termsAccepted || (!connected.google && !connected.meta && !connected.tiktok)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Continue →
              </button>
              <button
                onClick={() => setStep('chat')}
                disabled={!termsAccepted}
                className="w-full text-sm text-slate-400 hover:text-slate-600 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Skip — I'll connect later
              </button>
            </div>
          </div>
        </div>
        <ChatDrawer />
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
                Website Review
              </div>
              <h2 className="text-xl font-bold text-slate-900">Let's make sure we understand your business</h2>
              <p className="text-slate-500 text-sm mt-1">Vigmis scanned your website. Here's what we understood — please confirm or add details.</p>
            </div>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

            {/* What we understood */}
            <div className={`border rounded-xl p-5 space-y-3 ${websiteCheck.adequate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {websiteCheck.adequate ? 'What Vigmis understood from your website' : 'Website information is incomplete'}
              </p>
              {websiteCheck.summary && (
                <p className="text-sm text-slate-800 leading-relaxed">{websiteCheck.summary}</p>
              )}
              {!websiteCheck.adequate && !websiteCheck.summary && (
                <p className="text-sm text-amber-700">We couldn't extract enough information from your website to build a confident strategy.</p>
              )}
              {websiteCheck.what_they_sell && (
                <div className="grid grid-cols-2 gap-2">
                  {websiteCheck.hero_product && (
                    <div className="bg-white rounded-lg p-3 border border-white/60">
                      <p className="text-xs text-slate-400 mb-0.5">Main product / service</p>
                      <p className="text-sm font-semibold text-slate-800">{websiteCheck.hero_product}</p>
                    </div>
                  )}
                  {websiteCheck.target_audience && (
                    <div className="bg-white rounded-lg p-3 border border-white/60">
                      <p className="text-xs text-slate-400 mb-0.5">Target audience</p>
                      <p className="text-sm font-semibold text-slate-800">{websiteCheck.target_audience}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Questions from Vigmis */}
            {websiteCheck.unclear.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Vigmis needs a few clarifications</p>
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
                  ? 'Your answers / clarifications'
                  : 'Anything to add or correct? (optional)'}
              </label>
              <textarea
                value={websiteNotes}
                onChange={e => setWebsiteNotes(e.target.value)}
                placeholder={websiteCheck.unclear.length > 0
                  ? 'Answer the questions above — this helps Vigmis build a better strategy...'
                  : 'e.g. Our hero product is the Premium plan. We target small business owners, not individuals...'}
                rows={4}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setStep('chat'); setWebsiteCheck(null); setWebsiteNotes(''); }}
                className="border border-slate-200 text-slate-600 text-sm font-semibold px-5 py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Back to chat
              </button>
              <button
                onClick={() => runAnalysisFlow(pendingSettings, undefined, true)}
                disabled={websiteCheck.unclear.length > 0 && !websiteNotes.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {websiteCheck.unclear.length > 0 && !websiteNotes.trim()
                  ? 'Please answer above to continue'
                  : 'Build my strategy →'}
              </button>
            </div>
          </div>
        </div>
        <ChatDrawer />
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
              <h2 className="text-xl font-bold text-slate-900">Vigmis is working for you</h2>
              <p className="text-sm text-slate-500 mt-1">This takes about 20 seconds</p>
            </div>
            <div className="space-y-4 text-left">
              {ANALYSIS_STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
                    analysisStep > i ? 'bg-emerald-500 text-white' :
                    analysisStep === i ? 'bg-indigo-600 text-white' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {analysisStep > i ? '✓' : i + 1}
                  </div>
                  <span className={`text-sm font-medium ${analysisStep >= i ? 'text-slate-900' : 'text-slate-400'}`}>
                    {s.label}
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
              <h2 className="text-2xl font-bold text-slate-900">Your campaign plan is ready</h2>
              <p className="text-slate-500 text-sm mt-1">Based on your website analysis and market research</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Market insights */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 space-y-3">
              <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Market Insights</p>
              <p className="text-sm text-slate-800 leading-relaxed">{strategy.market_insights}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border border-indigo-100">
                  <p className="text-xs text-slate-400 font-medium mb-1">Target Audience</p>
                  <p className="text-sm text-slate-800 font-medium leading-snug">{strategy.target_audience}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-indigo-100">
                  <p className="text-xs text-slate-400 font-medium mb-1">Estimated CPC</p>
                  <p className="text-sm text-slate-800 font-bold">{strategy.estimated_cpc}</p>
                </div>
              </div>
            </div>

            {/* Budget allocation */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-semibold text-slate-700">
                  Budget Allocation — <span className="text-indigo-600">${managedBudget}/month</span>
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {strategy.platforms.map(platform => {
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
                ? '⚠ Budget may be too low'
                : ba.verdict === 'exceeds_ceiling'
                ? '↓ Budget exceeds efficient ceiling'
                : '✓ Budget is workable';
              const verdictTextColor = ba.verdict === 'too_low'
                ? 'text-red-700'
                : ba.verdict === 'exceeds_ceiling'
                ? 'text-amber-700'
                : 'text-emerald-700';
              return (
                <div className={`border rounded-xl p-5 space-y-4 ${verdictColor}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Budget Advisory</p>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full bg-white ${verdictTextColor}`}>{verdictLabel}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{ba.verdict_explanation}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { label: 'Minimum to enter market', value: `$${ba.minimum_monthly_usd}/mo` },
                      { label: 'Recommended (learning phase)', value: `$${ba.recommended_learning_usd}/mo` },
                      { label: 'Recommended (ongoing)', value: `$${ba.recommended_steady_usd}/mo` },
                      { label: 'Efficiency ceiling', value: `$${ba.efficiency_ceiling_usd}/mo` },
                    ].map(item => (
                      <div key={item.label} className="bg-white rounded-lg p-3 border border-white/60">
                        <p className="text-xs text-slate-400 mb-0.5">{item.label}</p>
                        <p className="text-sm font-bold text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Est. clicks/mo', value: ba.projected_clicks_monthly.toLocaleString() },
                      { label: 'Est. leads/mo', value: ba.projected_leads_monthly.toLocaleString() },
                      { label: 'Break-even sales', value: `${ba.break_even_conversions}` },
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
                      <p className="text-xs font-semibold text-slate-500">Platforms not recommended:</p>
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
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Paid Campaign Recommendations</p>
              <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{strategy.recommendations}</p>
            </div>

            {/* Past performance notes */}
            {strategy.past_performance_notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-5">
                <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">Learnings from Your Previous Campaigns</p>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{strategy.past_performance_notes}</p>
              </div>
            )}

            {/* Organic recommendations */}
            {strategy.organic_recommendations && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2">Organic Growth — Complement Your Ads</p>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{strategy.organic_recommendations}</p>
                <p className="text-xs text-slate-400 mt-3">Organic channels reduce ad dependency over time and improve campaign quality scores.</p>
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
                        <p className="text-sm font-bold text-slate-900">Social Media Management</p>
                        {sp.recommended && (
                          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">AI Recommended</span>
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
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Select platforms</p>
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
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Approval mode</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {([
                            { value: 'auto', label: 'Auto', desc: 'Posts go live automatically' },
                            { value: 'review', label: 'Review', desc: '24h window to approve' },
                            { value: 'strict', label: 'Strict', desc: 'Manual approval required' },
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
                        <p className="text-xs text-slate-500">Estimated cost — 1 post/week per platform</p>
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
                  <p className="text-sm font-semibold text-slate-800">What would you like to change?</p>
                  <p className="text-xs text-slate-400 mt-0.5">Vigmis will share its honest opinion before updating the plan.</p>
                </div>

                <textarea
                  value={strategyFeedback}
                  onChange={e => { setStrategyFeedback(e.target.value); setDiscussionResponse(null); }}
                  placeholder="e.g. I want to include TikTok, or I'd prefer a lower budget, or focus only on Google Search..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />

                {/* Vigmis's discussion response */}
                {discussionResponse && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Vigmis's Take</p>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{discussionResponse}</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setDiscussionResponse(null); setStrategyFeedback(''); }}
                        className="flex-1 border border-slate-200 text-slate-600 text-xs font-semibold py-2 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        Modify my request
                      </button>
                      <button
                        onClick={handleRevise}
                        disabled={isRevising}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
                      >
                        {isRevising ? 'Updating...' : 'Proceed with my decision →'}
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
                      {isDiscussing ? 'Thinking...' : 'Get Vigmis\'s opinion →'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Campaign Plan Summary — shown before approval */}
                <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden">
                  <div className="bg-slate-900 px-5 py-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Campaign Plan Summary</p>
                    <p className="text-white font-bold text-base mt-0.5">Ready for your approval</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {/* Platforms & budget */}
                    <div className="px-5 py-4 space-y-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Platforms & Budget</p>
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
                        <span className="text-sm font-bold text-slate-700">Total managed budget</span>
                        <span className="text-sm font-black text-indigo-600">${managedBudget}/mo</span>
                      </div>
                    </div>
                    {/* Budget decision */}
                    {strategy.budget_analysis && (
                      <div className="px-5 py-4 space-y-1">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Budget Decision</p>
                        <p className="text-sm text-slate-700">{strategy.budget_analysis.verdict_explanation}</p>
                        <div className="flex gap-4 pt-1">
                          <span className="text-xs text-slate-400">Est. clicks: <strong className="text-slate-700">{strategy.budget_analysis.projected_clicks_monthly.toLocaleString()}/mo</strong></span>
                          <span className="text-xs text-slate-400">Est. leads: <strong className="text-slate-700">{strategy.budget_analysis.projected_leads_monthly.toLocaleString()}/mo</strong></span>
                          <span className="text-xs text-slate-400">Break-even: <strong className="text-slate-700">{strategy.budget_analysis.break_even_conversions} sales</strong></span>
                        </div>
                      </div>
                    )}
                    {/* Goal */}
                    <div className="px-5 py-4 flex justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider self-center">Goal</span>
                      <span className="text-sm font-semibold text-slate-700 capitalize">{pendingSettings.goal}</span>
                    </div>
                    {/* Target */}
                    <div className="px-5 py-4 flex justify-between">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider self-center">Target Market</span>
                      <span className="text-sm font-semibold text-slate-700">{(pendingSettings.geo_include ?? []).join(', ')}</span>
                    </div>
                    {/* Learning period */}
                    <div className="px-5 py-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Timeline</p>
                      <p className="text-xs text-slate-500">Days 1–7: Learning phase — Vigmis collects data before making budget changes. Alerts are active from day 1.</p>
                      <p className="text-xs text-slate-500 mt-1">Day 8+: Full optimization begins — budget adjustments, creative refresh, targeting review.</p>
                    </div>
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
                      I confirm that I have reviewed this campaign plan in full. The budget of{' '}
                      <strong>${managedBudget}/month</strong> is my informed decision, made after reviewing Vigmis's analysis and recommendations.
                      I understand that projected outcomes (clicks, leads, conversions) are estimates based on market benchmarks, not guarantees.
                    </span>
                  </label>

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowFeedback(true); setDiscussionResponse(null); }}
                      className="border border-indigo-200 text-indigo-600 text-sm font-semibold py-3 px-5 rounded-xl hover:bg-white transition-colors"
                    >
                      Request Changes
                    </button>
                    <button
                      onClick={() => setStep('creative')}
                      disabled={!planApproved}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
                    >
                      Approve Plan & Continue →
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              onClick={() => setStep('chat')}
              className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors py-1"
            >
              Go back to edit details
            </button>
          </div>
        </div>
        <ChatDrawer />
      </div>
    );
  }

  // ── Creative ──────────────────────────────────────────────────────────────────
  if (step === 'creative') {
    const videoOptions = [
      {
        type: 'avatar' as const,
        title: 'Talking Avatar',
        subtitle: 'A realistic spokesperson presents your business',
        price: '$15',
        bestFor: 'Services, consulting, apps',
        recommended: true,
        icon: '🎙️',
      },
      {
        type: 'cinematic' as const,
        title: 'Cinematic',
        subtitle: 'Cinematic visuals, product shots, transitions',
        price: '$12',
        bestFor: 'Restaurants, fashion, real estate',
        recommended: false,
        icon: '🎬',
      },
      {
        type: 'animation' as const,
        title: 'Animation',
        subtitle: 'Motion graphics and animated explainer',
        price: '$8',
        bestFor: 'Tech, SaaS, e-commerce',
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
              <h2 className="text-2xl font-bold text-slate-900">Creative Assets</h2>
              <p className="text-slate-500 text-sm mt-1">
                Your campaign needs visual ads to run. Choose how you want to handle creative.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">AI Recommendation</p>
              <p className="text-sm text-slate-700 leading-relaxed">
                A <strong>talking avatar</strong> video builds trust quickly — it works especially well on TikTok and Meta for service businesses.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">AI-generated video</p>
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
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">Recommended</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{opt.subtitle}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Best for: {opt.bestFor}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-slate-900">{opt.price}</p>
                    <p className="text-xs text-slate-400">per video</p>
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
                  <p className="text-sm font-semibold text-slate-800">I have my own creative</p>
                  <p className="text-xs text-slate-500 mt-0.5">Upload images or videos from the dashboard after setup</p>
                </div>
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleCreativeDone('skip')}
                className="flex-1 border border-slate-200 text-slate-500 text-sm font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Skip for now
              </button>
              <button
                onClick={() => creativeChoice && handleCreativeDone(creativeChoice)}
                disabled={!creativeChoice}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Continue →
              </button>
            </div>

            <p className="text-xs text-center text-slate-400">
              You can always add or change creative assets from the dashboard
            </p>
          </div>
        </div>
        <ChatDrawer />
      </div>
    );
  }

  // ── Tracking Setup ────────────────────────────────────────────────────────────
  if (step === 'tracking') {
    const isEcommerce = pendingSettings?.goal === 'purchases' ||
      pendingSettings?.business_type === 'ecommerce' ||
      pendingSettings?.business_type === 'hero_product';

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
                Conversion Intelligence
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Install your tracking pixel</h2>
              <p className="text-slate-500 text-sm mt-1">
                Vigmis measures your <strong>actual business results</strong>, not just what the ad platforms claim.
                Without this, you only see platform ROAS — which is often 2–3× inflated.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
            )}

            {/* Why this matters */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">Why this matters</p>
              <p className="text-sm text-slate-700 leading-relaxed">
                Ad platforms like Meta and Google each claim credit for the same sale. The result: your reported ROAS is <strong>artificially inflated by 30–200%</strong>.
                Vigmis measures what actually happened on your website — the real number.
              </p>
              {pendingSettings?.margin_pct && (
                <p className="text-sm text-slate-700 leading-relaxed">
                  With your {pendingSettings.margin_pct}% margin, Vigmis will show your <strong>actual profit per campaign</strong>, not just revenue.
                </p>
              )}
            </div>

            {/* Pixel snippet */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Step 1 — Paste this on every page of your website</p>
                <span className="text-xs text-slate-400">Before &lt;/head&gt;</span>
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
                      {pixelCopied ? '✓ Copied to clipboard!' : 'Copy snippet'}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-sm">Loading snippet...</div>
                )}
              </div>
            </div>

            {/* Verify installation */}
            <div className={`border rounded-xl p-5 space-y-3 ${pixelVerified ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'} shadow-sm`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Step 2 — Verify installation</p>
                {pixelVerified && <span className="text-xs font-bold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full">✓ Verified</span>}
              </div>
              {pixelVerified ? (
                <p className="text-sm text-emerald-700">Pixel is firing correctly. Vigmis is now tracking real conversions on your website.</p>
              ) : (
                <>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    After pasting the snippet, visit your website and come back here to verify it's working.
                  </p>
                  <button
                    onClick={handleVerifyPixel}
                    disabled={pixelVerifying || !pixelSnippet}
                    className="w-full border border-indigo-200 text-indigo-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-indigo-50 disabled:opacity-40 transition-colors"
                  >
                    {pixelVerifying ? 'Checking...' : 'Check if pixel is working →'}
                  </button>
                </>
              )}
            </div>

            {/* Shopify connect (for ecommerce) */}
            {isEcommerce && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-700">Step 3 — Connect Shopify (optional)</p>
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">Recommended</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">Direct order data = more accurate True ROAS than pixel alone</p>
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Connect your Shopify store so Vigmis receives actual order data with exact revenue per campaign — the gold standard for attribution.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shopifyDomain}
                      onChange={e => setShopifyDomain(e.target.value)}
                      placeholder="yourstore.myshopify.com"
                      className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleShopifyConnect}
                      disabled={!shopifyDomain.trim() || shopifyConnecting}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors flex-shrink-0"
                    >
                      {shopifyConnecting ? 'Connecting...' : 'Connect →'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">WooCommerce, Wix, and custom integrations coming soon.</p>
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleTrackingDone(true)}
                className="flex-1 border border-slate-200 text-slate-500 text-sm font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Skip for now
              </button>
              <button
                onClick={() => handleTrackingDone(false)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {pixelVerified ? 'Launch my campaigns →' : "I've installed the pixel →"}
              </button>
            </div>

            {!pixelVerified && (
              <p className="text-xs text-center text-slate-400">
                You can always install tracking later from the dashboard — campaigns will start even without it.
              </p>
            )}
          </div>
        </div>
        <ChatDrawer />
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
              <p className="font-semibold text-slate-900">Setting up your campaigns...</p>
              <p className="text-sm text-slate-500 mt-1">Just a moment</p>
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
      <ChatDrawer />
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
