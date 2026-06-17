'use client';

import { useState, useEffect, useTransition } from 'react';
import { getPendingFeedback, submitFeedback } from './chat-actions';

type Step = 'rating' | 'followup' | 'done';

export default function FeedbackModal() {
  const [prompt, setPrompt] = useState<{ trigger: string; question: string } | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [followup, setFollowup] = useState('');
  const [step, setStep] = useState<Step>('rating');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      // Don't show if the user snoozed via "Later"
      const snoozedUntil = localStorage.getItem('vigmis_feedback_snoozed_until');
      if (snoozedUntil && Date.now() < Number(snoozedUntil)) return;

      getPendingFeedback()
        .then(p => { if (p) setPrompt(p); })
        .catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!prompt) return null;

  // ── Step: done ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center space-y-3">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-bold text-slate-900">Thank you for your feedback!</p>
          <p className="text-sm text-slate-500">This helps us improve VIGMIS for you.</p>
          <button onClick={() => setPrompt(null)} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium mt-2">
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Shared submit helper ────────────────────────────────────────────────────
  function doSubmit(followupText?: string) {
    startTransition(async () => {
      try {
        await submitFeedback(prompt!.trigger, rating, undefined, followupText || undefined);
        setStep('done');
      } catch {}
    });
  }

  // ── Step: follow-up question ────────────────────────────────────────────────
  if (step === 'followup') {
    const followupQuestion = rating >= 4
      ? 'What worked well for you?'
      : 'What could be better?';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-bold text-slate-900 text-base leading-snug">{followupQuestion}</h2>
            <button
              onClick={() => setPrompt(null)}
              className="text-slate-400 hover:text-slate-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-lg leading-none flex-shrink-0"
            >
              ×
            </button>
          </div>

          <textarea
            value={followup}
            onChange={e => setFollowup(e.target.value)}
            placeholder="Optional — share as little or as much as you like"
            rows={3}
            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            autoFocus
          />

          <div className="flex gap-3 items-center">
            <button
              onClick={() => doSubmit(undefined)}
              disabled={isPending}
              className="text-sm text-slate-400 hover:text-slate-600 font-medium transition-colors"
            >
              Skip
            </button>
            <button
              onClick={() => doSubmit(followup)}
              disabled={isPending}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {isPending ? 'Sending...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: star rating ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-bold text-slate-900 text-base leading-snug">{prompt.question}</h2>
          <button
            onClick={() => setPrompt(null)}
            className="text-slate-400 hover:text-slate-600 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-lg leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={`text-3xl transition-transform hover:scale-110 ${star <= rating ? 'text-amber-400' : 'text-slate-200'}`}
            >
              ★
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              localStorage.setItem('vigmis_feedback_snoozed_until', String(Date.now() + 7 * 24 * 60 * 60 * 1000));
              setPrompt(null);
            }}
            className="flex-1 border border-slate-200 text-slate-500 text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Later
          </button>
          <button
            onClick={() => { if (rating) setStep('followup'); }}
            disabled={!rating}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
