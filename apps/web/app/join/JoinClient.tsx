'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvite } from './actions';

export default function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await acceptInvite(token);
      if ('error' in result) {
        setStatus('error');
        setMessage(result.error);
      } else {
        setStatus('success');
        setTimeout(() => router.replace('/dashboard'), 1500);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-10 max-w-md w-full text-center">
      <div className="mb-6">
        <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900">Joining workspace</h1>
        <p className="text-sm text-slate-500 mt-2">You have been invited to collaborate on a Vigmis workspace.</p>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Accepting invitation…
        </div>
      )}

      {status === 'success' && (
        <div className="text-emerald-600 font-semibold text-sm">
          ✓ Invitation accepted — redirecting to dashboard…
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{message}</div>
          <a href="/dashboard" className="inline-block text-sm text-indigo-600 font-semibold hover:underline">
            Go to dashboard →
          </a>
        </div>
      )}
    </div>
  );
}
