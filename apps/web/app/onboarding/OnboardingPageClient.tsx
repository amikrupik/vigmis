'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import OnboardingChat from '../components/OnboardingChat';
import ChatDrawer from '../dashboard/ChatDrawer';
import type { OnboardingSettings, AnalysisResult } from './actions';
import { runAnalysis } from './actions';
import type { ConversationMessage, StrategyPlan } from '@vigmis/db';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Step = 'connect' | 'chat' | 'analysis' | 'strategy' | 'creative' | 'saving';
type CreativeChoice = 'avatar' | 'cinematic' | 'animation' | 'upload' | 'skip' | null;

const STEPS: { key: Step; label: string }[] = [
  { key: 'connect', label: 'Connect' },
  { key: 'chat', label: 'Interview' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'creative', label: 'Creative' },
];

const STEP_INDEX: Record<Step, number> = {
  connect: 0, chat: 1, analysis: 2, strategy: 3, creative: 4, saving: 5,
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
}

export default function OnboardingPageClient({ initialConnected, initialError }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('connect');
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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [hasParallelCampaigns, setHasParallelCampaigns] = useState(false);

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

  async function runAnalysisFlow(settings: OnboardingSettings, feedback?: string) {
    setStep('analysis');
    setAnalysisStep(0);
    try {
      const timer1 = setTimeout(() => setAnalysisStep(1), 1500);
      const timer2 = setTimeout(() => setAnalysisStep(2), 4000);
      const result = await runAnalysis(settings, feedback);
      clearTimeout(timer1);
      clearTimeout(timer2);
      setAnalysisStep(3);
      await new Promise(r => setTimeout(r, 500));
      setAnalysisResult(result);
      setStep('strategy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setStep('chat');
    }
  }

  async function handleRevise() {
    if (!strategyFeedback.trim() || !pendingSettings) return;
    setIsRevising(true);
    setError(null);
    const feedback = strategyFeedback;
    setStrategyFeedback('');
    setShowFeedback(false);
    await runAnalysisFlow(pendingSettings, feedback);
    setIsRevising(false);
  }

  async function handleCreativeDone(choice: CreativeChoice) {
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
          creative_choice: choice,
        }),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
      setStep('creative');
    }
  }

  // ── Header ────────────────────────────────────────────────────────────────────
  const header = (
    <header className="border-b border-slate-200 bg-white px-6 py-4 flex-shrink-0">
      <div className="max-w-2xl mx-auto flex items-center gap-6">
        <Image src="/logo.png" alt="Vigmis" width={100} height={36} priority className="flex-shrink-0" />
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
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  I have read and agree to the{' '}
                  <a href="/terms" target="_blank" className="text-indigo-600 hover:underline font-semibold">Terms of Service</a>
                  {', '}
                  <a href="/privacy" target="_blank" className="text-indigo-600 hover:underline font-semibold">Privacy Policy</a>
                  {', and '}
                  <a href="/acceptable-use" target="_blank" className="text-indigo-600 hover:underline font-semibold">Acceptable Use Policy</a>.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={e => setAgeConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-600">I confirm that I am 18 years of age or older.</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingOptIn}
                  onChange={e => setMarketingOptIn(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-500">I'd like to receive tips, product updates, and performance insights by email. (Optional)</span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasParallelCampaigns}
                  onChange={e => setHasParallelCampaigns(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
                />
                <span className="text-xs text-slate-500">
                  I have active campaigns on these platforms that I am <strong>not</strong> transferring to Vigmis.
                  <span className="text-slate-400 ml-1">(Helps us calibrate performance benchmarks correctly.)</span>
                </span>
              </label>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setStep('chat')}
                disabled={!termsAccepted || !ageConfirmed || (!connected.google && !connected.meta && !connected.tiktok)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Continue →
              </button>
              <button
                onClick={() => setStep('chat')}
                disabled={!termsAccepted || !ageConfirmed}
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

            {/* Feedback or CTA */}
            {showFeedback ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
                <p className="text-sm font-semibold text-slate-800">What would you like to change?</p>
                <textarea
                  value={strategyFeedback}
                  onChange={e => setStrategyFeedback(e.target.value)}
                  placeholder="e.g. Increase TikTok budget, target younger audience, reduce Google spend, focus on conversions..."
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowFeedback(false); setStrategyFeedback(''); }}
                    className="flex-1 border border-slate-200 text-slate-600 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRevise}
                    disabled={!strategyFeedback.trim() || isRevising}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    {isRevising ? 'Revising...' : 'Apply Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowFeedback(true)}
                  className="flex-1 border border-slate-200 text-slate-600 text-sm font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Request Changes
                </button>
                <button
                  onClick={() => setStep('creative')}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  Looks Good — Continue →
                </button>
              </div>
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
                onClick={() => handleCreativeDone(creativeChoice)}
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
