'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function UnsubscribePage() {
  const params = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    fetch(`${API_URL}/account/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => setStatus(r.ok ? 'success' : 'error'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <Link href="/"><Image src="/logo.png" alt="Vigmis" width={100} height={36} className="mb-12" /></Link>

      {status === 'pending' && (
        <p className="text-slate-500">Processing...</p>
      )}

      {status === 'success' && (
        <div className="text-center max-w-md">
          <div className="text-5xl mb-6">✓</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Unsubscribed successfully</h1>
          <p className="text-slate-500 mb-8">You will no longer receive alert emails from Vigmis. You can re-enable them anytime from Settings → Alert Settings.</p>
          <Link href="/dashboard" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">Go to Dashboard</Link>
        </div>
      )}

      {status === 'error' && (
        <div className="text-center max-w-md">
          <div className="text-5xl mb-6">✕</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-3">Invalid or expired link</h1>
          <p className="text-slate-500 mb-8">This unsubscribe link is not valid. You can manage your email preferences from your account settings.</p>
          <Link href="/dashboard" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">Go to Dashboard</Link>
        </div>
      )}
    </div>
  );
}
