'use client';

import { useState, useEffect, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getBillingStatus, startCheckout, openPortal } from './actions';

type BillingStatus = {
  plan: 'free' | 'pro';
  subscriptionStatus: string | null;
  period: { start: string; end: string };
  fee: {
    managedSpendUsd: number;
    feePercentage: number;
    percentageFeeUsd: number;
    subscriptionUsd: number;
    totalUsd: number;
    plan: string;
  };
};

export default function BillingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const successMsg = searchParams.get('success') === 'true';
  const canceledMsg = searchParams.get('canceled') === 'true';

  useEffect(() => {
    getBillingStatus()
      .then(setStatus)
      .catch(() => setError('שגיאה בטעינת נתוני חיוב'))
      .finally(() => setLoading(false));
  }, []);

  function handleUpgrade() {
    startTransition(async () => {
      try {
        const { url } = await startCheckout();
        window.location.href = url;
      } catch {
        setError('שגיאה בפתיחת עמוד תשלום');
      }
    });
  }

  function handlePortal() {
    startTransition(async () => {
      try {
        const { url } = await openPortal();
        window.location.href = url;
      } catch {
        setError('שגיאה בפתיחת פורטל ניהול');
      }
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const fee = status?.fee;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">← Dashboard</a>
          <span className="font-bold text-gray-900">Billing</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {successMsg && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
            ✅ שודרגת בהצלחה ל-Pro! תודה.
          </div>
        )}
        {canceledMsg && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
            השדרוג בוטל. אתה עדיין על מסלול Free.
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        )}

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Free */}
          <div className={`bg-white border-2 rounded-2xl p-6 space-y-4 ${status?.plan === 'free' ? 'border-blue-500' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Free</h2>
              {status?.plan === 'free' && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">תוכנית נוכחית</span>
              )}
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">$0</p>
              <p className="text-sm text-gray-500">לחודש</p>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>✓ 7% מה-spend המנוהל</li>
              <li>✓ אופטימיזציה פעם ביום</li>
              <li>✓ Google + Meta</li>
              <li>✓ Dashboard בסיסי</li>
            </ul>
          </div>

          {/* Pro */}
          <div className={`bg-white border-2 rounded-2xl p-6 space-y-4 ${status?.plan === 'pro' ? 'border-green-500' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Pro</h2>
              {status?.plan === 'pro' && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">תוכנית נוכחית</span>
              )}
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">$15</p>
              <p className="text-sm text-gray-500">לחודש + 5% spend</p>
            </div>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>✓ 5% בלבד מה-spend</li>
              <li>✓ אופטימיזציה 4x ביום</li>
              <li>✓ כל פיצ'רי Free</li>
              <li>✓ עדיפות בתמיכה</li>
            </ul>
            {status?.plan === 'free' ? (
              <button
                onClick={handleUpgrade}
                disabled={isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                {isPending ? 'טוען...' : 'שדרג ל-Pro →'}
              </button>
            ) : (
              <button
                onClick={handlePortal}
                disabled={isPending}
                className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-xl transition-colors"
              >
                נהל מנוי
              </button>
            )}
          </div>
        </div>

        {/* Current month estimate */}
        {fee && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-gray-900">חיוב חודש נוכחי (הערכה)</h2>
            <p className="text-xs text-gray-400">
              {status?.period.start} – {status?.period.end}
            </p>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Spend מנוהל</span>
                <span className="font-medium">${fee.managedSpendUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">עמלה ({fee.feePercentage}%)</span>
                <span className="font-medium">${fee.percentageFeeUsd.toFixed(2)}</span>
              </div>
              {fee.subscriptionUsd > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">מנוי Pro</span>
                  <span className="font-medium">${fee.subscriptionUsd.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-2 flex justify-between">
                <span className="font-semibold text-gray-900">סה"כ חזוי</span>
                <span className="font-bold text-xl text-gray-900">${fee.totalUsd.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              * הסכום הסופי מחושב בסוף החודש לפי spend בפועל מגוגל ומטא.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
