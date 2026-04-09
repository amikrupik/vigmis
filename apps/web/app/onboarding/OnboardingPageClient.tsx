'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingChat from '../components/OnboardingChat';
import type { OnboardingSettings, AnalysisResult } from './actions';
import { runAnalysis } from './actions';
import type { ConversationMessage, StrategyPlan } from '@vigmis/db';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Step = 'connect' | 'chat' | 'analysis' | 'strategy' | 'saving';

const ANALYSIS_STEPS = [
  { key: 'website', label: 'סורק את האתר שלך...' },
  { key: 'research', label: 'מחקר שוק מעמיק...' },
  { key: 'strategy', label: 'בונה תכנית קמפיין...' },
];

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_denied: 'חיבור Google בוטל',
  google_failed: 'חיבור Google נכשל — אנא נסה שוב',
  meta_denied: 'חיבור Meta בוטל',
  meta_failed: 'חיבור Meta נכשל — אנא נסה שוב',
  invalid_state: 'שגיאת אבטחה בחיבור — אנא נסה שוב',
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
  });
  const [error, setError] = useState<string | null>(
    initialError ? (OAUTH_ERROR_MESSAGES[initialError] ?? 'שגיאה בחיבור') : null,
  );
  const [pendingSettings, setPendingSettings] = useState<OnboardingSettings | null>(null);
  const [pendingConversation, setPendingConversation] = useState<ConversationMessage[]>([]);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  async function handleConnect(platform: 'google' | 'meta') {
    try {
      const token = await getClerkToken();
      window.location.href = `${API_URL}/auth/${platform}?token=${encodeURIComponent(token)}`;
    } catch {
      setError('שגיאה בטעינת הסשן — אנא רענן את הדף');
    }
  }

  async function handleChatConfirm(settings: OnboardingSettings, conversation: ConversationMessage[]) {
    setPendingSettings(settings);
    setPendingConversation(conversation);
    setStep('analysis');
    setAnalysisStep(0);

    try {
      // Simulate step progression during analysis
      const timer1 = setTimeout(() => setAnalysisStep(1), 1500);
      const timer2 = setTimeout(() => setAnalysisStep(2), 4000);

      const result = await runAnalysis(settings);

      clearTimeout(timer1);
      clearTimeout(timer2);
      setAnalysisStep(3);

      await new Promise(r => setTimeout(r, 500));
      setAnalysisResult(result);
      setStep('strategy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בניתוח');
      setStep('chat');
    }
  }

  async function handleStrategyConfirm() {
    if (!pendingSettings || !analysisResult) return;
    setStep('saving');
    setError(null);

    try {
      const token = await getClerkToken();
      const res = await fetch(`${API_URL}/onboarding/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...pendingSettings,
          conversation: pendingConversation,
          strategy_plan: analysisResult.strategy,
        }),
      });

      if (!res.ok) throw new Error('שגיאה בשמירת ההגדרות');
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה לא צפויה');
      setStep('strategy');
    }
  }

  // ── Connect step ─────────────────────────────────────────────────────────────
  if (step === 'connect') {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">חבר את חשבונות הפרסום שלך</h1>
            <p className="text-gray-500 text-sm">
              Vigmis צריך גישה לחשבונות שלך כדי לנהל קמפיינים בשמך
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleConnect('google')}
              className="w-full flex items-center gap-3 border border-gray-200 rounded-xl px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-sm font-medium text-gray-700">
                {connected.google ? '✓ Google Ads מחובר' : 'חבר Google Ads'}
              </span>
            </button>

            <button
              onClick={() => handleConnect('meta')}
              className="w-full flex items-center gap-3 border border-gray-200 rounded-xl px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span className="text-sm font-medium text-gray-700">
                {connected.meta ? '✓ Meta Ads מחובר' : 'חבר Meta Ads'}
              </span>
            </button>
          </div>

          <p className="text-center text-xs text-gray-400">
            אפשר לחבר פלטפורמה אחת עכשיו ולהוסיף את השנייה מאוחר יותר
          </p>

          <button
            onClick={() => setStep('chat')}
            disabled={!connected.google && !connected.meta}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors"
          >
            המשך לשאלות
          </button>

          <button
            onClick={() => setStep('chat')}
            className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            המשך בלי לחבר עכשיו
          </button>
        </div>
      </div>
    );
  }

  // ── Analysis loading step ─────────────────────────────────────────────────────
  if (step === 'analysis') {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div>
            <div className="w-12 h-12 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900">ויגמיס עובד בשבילך</h2>
            <p className="text-sm text-gray-500 mt-1">זה לוקח כ-20 שניות</p>
          </div>

          <div className="space-y-3 text-left">
            {ANALYSIS_STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
                  analysisStep > i
                    ? 'bg-green-500 text-white'
                    : analysisStep === i
                    ? 'bg-blue-600 text-white animate-pulse'
                    : 'bg-gray-100 text-gray-400'
                }`}>
                  {analysisStep > i ? '✓' : i + 1}
                </div>
                <span className={`text-sm ${analysisStep >= i ? 'text-gray-900' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Strategy plan step ────────────────────────────────────────────────────────
  if (step === 'strategy' && analysisResult && pendingSettings) {
    const { strategy } = analysisResult;
    const managedBudget = Math.round(
      (pendingSettings.budget_monthly_ils / 3.7) * (pendingSettings.management_percentage / 100)
    );

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">התכנית שלך מוכנה</h2>
            <p className="text-gray-500 text-sm mt-1">בסיס: ניתוח האתר שלך + מחקר שוק ממוקד</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Market insights */}
          <div className="bg-blue-50 rounded-xl p-4 space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">תובנות שוק</p>
            <p className="text-sm text-gray-800">{strategy.market_insights}</p>
            <p className="text-sm text-gray-600 mt-2">
              <span className="font-medium">קהל יעד:</span> {strategy.target_audience}
            </p>
            <p className="text-sm text-gray-600">
              <span className="font-medium">CPC צפוי:</span> {strategy.estimated_cpc}
            </p>
          </div>

          {/* Platforms */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-700">חלוקת תקציב מוצעת (${managedBudget}/חודש)</p>
            {strategy.platforms.map(platform => {
              const platformBudget = Math.round((managedBudget * platform.budget_percentage) / 100);
              return (
                <div key={platform.name} className="border border-gray-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 capitalize">{platform.name}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {platform.campaign_types.join(', ')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-gray-900">{platform.budget_percentage}%</span>
                      <span className="text-xs text-gray-500 ml-1">(${platformBudget})</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full">
                    <div
                      className="h-1.5 bg-blue-500 rounded-full"
                      style={{ width: `${platform.budget_percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">{platform.reasoning}</p>
                </div>
              );
            })}
          </div>

          {/* Recommendations */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">המלצות</p>
            <p className="text-sm text-gray-700 whitespace-pre-line">{strategy.recommendations}</p>
          </div>

          {/* CTA */}
          <button
            onClick={handleStrategyConfirm}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
          >
            אשר ולחץ Start →
          </button>

          <button
            onClick={() => setStep('chat')}
            className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            חזור לשינוי פרטים
          </button>
        </div>
      </div>
    );
  }

  // ── Saving ────────────────────────────────────────────────────────────────────
  if (step === 'saving') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-sm">מפעיל את הקמפיינים...</p>
        </div>
      </div>
    );
  }

  // ── Chat step ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col">
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <OnboardingChat onConfirm={handleChatConfirm} />
    </div>
  );
}

// Helper — get Clerk token from the browser
async function getClerkToken(): Promise<string> {
  const { Clerk } = window as any;
  if (!Clerk) throw new Error('Clerk not loaded');
  const token = await Clerk.session?.getToken();
  if (!token) throw new Error('לא מחובר — אנא התחבר מחדש');
  return token;
}
