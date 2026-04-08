'use client';

import { useState, useEffect, useTransition } from 'react';
import { getPendingFeedback, submitFeedback } from './chat-actions';

export default function FeedbackModal() {
  const [prompt, setPrompt] = useState<{ trigger: string; question: string } | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Check for pending feedback after a short delay (don't block initial render)
    const timer = setTimeout(() => {
      getPendingFeedback()
        .then(p => { if (p) setPrompt(p); })
        .catch(() => { /* silently ignore */ });
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!prompt) return null;

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 text-center space-y-3">
          <p className="text-3xl">🙏</p>
          <p className="font-semibold text-gray-900">תודה על המשוב!</p>
          <p className="text-sm text-gray-500">זה עוזר לנו לשפר את VIGMIS עבורך.</p>
          <button
            onClick={() => setPrompt(null)}
            className="mt-2 text-sm text-blue-600 hover:text-blue-700"
          >
            סגור
          </button>
        </div>
      </div>
    );
  }

  function handleSubmit() {
    if (!rating) return;
    startTransition(async () => {
      try {
        await submitFeedback(prompt!.trigger, rating, comment || undefined);
        setSubmitted(true);
      } catch { /* ignore */ }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-5">
        <div className="flex items-start justify-between">
          <h2 className="font-bold text-gray-900 text-lg leading-snug">{prompt.question}</h2>
          <button
            onClick={() => setPrompt(null)}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-3 flex-shrink-0"
          >
            ×
          </button>
        </div>

        {/* Star rating */}
        <div className="flex gap-2 justify-center">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={`text-3xl transition-transform hover:scale-110 ${star <= rating ? 'text-yellow-400' : 'text-gray-200'}`}
            >
              ★
            </button>
          ))}
        </div>

        {rating > 0 && (
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="רוצה לספר לנו עוד? (לא חובה)"
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setPrompt(null)}
            className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            אחר כך
          </button>
          <button
            onClick={handleSubmit}
            disabled={!rating || isPending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {isPending ? 'שולח...' : 'שלח משוב'}
          </button>
        </div>
      </div>
    </div>
  );
}
