'use client';

import { useState, useEffect, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { getBillingStatus, startCheckout, openPortal, getInvoices } from './actions';

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
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const successMsg = searchParams.get('success') === 'true';
  const canceledMsg = searchParams.get('canceled') === 'true';

  useEffect(() => {
    Promise.all([getBillingStatus(), getInvoices().catch(() => ({ invoices: [] }))])
      .then(([s, inv]) => { setStatus(s); setInvoices(inv?.invoices ?? []); })
      .catch(() => setError('Failed to load billing information'))
      .finally(() => setLoading(false));
  }, []);

  function handleUpgrade() {
    startTransition(async () => {
      try {
        const { url } = await startCheckout();
        window.location.href = url;
      } catch {
        setError('Failed to open payment page');
      }
    });
  }

  function handlePortal() {
    startTransition(async () => {
      try {
        const { url } = await openPortal();
        window.location.href = url;
      } catch {
        setError('Failed to open billing portal');
      }
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const fee = status?.fee;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <a href="/dashboard" className="text-slate-400 hover:text-slate-700 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <h1 className="font-bold text-slate-900 text-lg">Billing</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 font-medium">
            Successfully upgraded to Pro! Thank you.
          </div>
        )}
        {canceledMsg && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
            Upgrade canceled. You are still on the Free plan.
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
        )}

        {/* Plans */}
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Plans</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Free */}
            <div className={`bg-white rounded-2xl p-6 space-y-5 border-2 shadow-sm ${status?.plan === 'free' ? 'border-indigo-500' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Free</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Get started, no commitment</p>
                </div>
                {status?.plan === 'free' && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-semibold">Current</span>
                )}
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">$0</p>
                <p className="text-sm text-slate-400 mt-0.5">per month</p>
              </div>
              <ul className="space-y-2.5 text-sm text-slate-600">
                {[
                  '7% of managed ad spend',
                  'Optimization once per day',
                  'Google + Meta + TikTok',
                  'AI chat assistant',
                  'Basic dashboard',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro */}
            <div className={`bg-white rounded-2xl p-6 space-y-5 border-2 shadow-sm ${status?.plan === 'pro' ? 'border-emerald-500' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Pro</h3>
                  <p className="text-xs text-slate-400 mt-0.5">For businesses scaling fast</p>
                </div>
                {status?.plan === 'pro' && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-semibold">Current</span>
                )}
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-900">$15</p>
                <p className="text-sm text-slate-400 mt-0.5">per month + 5% spend</p>
              </div>
              <ul className="space-y-2.5 text-sm text-slate-600">
                {[
                  '5% of managed ad spend (saves 2%)',
                  'Optimization 4× per day',
                  'All Free features',
                  'Priority AI support',
                  'Advanced reporting',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-emerald-500 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              {status?.plan === 'free' ? (
                <button
                  onClick={handleUpgrade}
                  disabled={isPending}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  {isPending ? 'Loading...' : 'Upgrade to Pro →'}
                </button>
              ) : (
                <button
                  onClick={handlePortal}
                  disabled={isPending}
                  className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl transition-colors"
                >
                  {isPending ? 'Loading...' : 'Manage Subscription'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Current month estimate */}
        {fee && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex items-start justify-between">
              <h2 className="font-bold text-slate-900">Current Month Estimate</h2>
              <span className="text-xs text-slate-400">{status?.period.start} – {status?.period.end}</span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Managed Spend</span>
                <span className="font-semibold text-slate-800">${fee.managedSpendUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Fee ({fee.feePercentage}%)</span>
                <span className="font-semibold text-slate-800">${fee.percentageFeeUsd.toFixed(2)}</span>
              </div>
              {fee.subscriptionUsd > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Pro Subscription</span>
                  <span className="font-semibold text-slate-800">${fee.subscriptionUsd.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                <span className="font-bold text-slate-900">Estimated Total</span>
                <span className="font-bold text-2xl text-slate-900">${fee.totalUsd.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
              * Final amount is calculated at month end based on actual spend from Google, Meta, and TikTok.
            </p>
          </div>
        )}

        {/* Invoice History */}
        {invoices.length === 0 && !loading && (
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Invoice History</h2>
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm space-y-1">
              <p className="text-sm font-semibold text-slate-600">No invoices yet</p>
              <p className="text-xs text-slate-400">Your first invoice will appear here at the end of the month.</p>
            </div>
          </div>
        )}
        {invoices.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Invoice History</h2>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {invoices.map(inv => (
                  <div key={inv.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{inv.period_start} — {inv.period_end}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Managed spend: ${inv.managed_spend_usd?.toFixed(2)} · Fee: ${inv.fee_usd?.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : inv.status === 'draft' ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>{inv.status}</span>
                      <span className="font-bold text-slate-900">${inv.total_usd?.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
