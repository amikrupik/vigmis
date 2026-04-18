'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'vigmis_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setVisible(false);
  }

  function reject() {
    localStorage.setItem(STORAGE_KEY, 'essential_only');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto bg-slate-900 text-white rounded-2xl shadow-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-0.5">We use cookies</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            We use essential cookies for authentication and analytics cookies to improve your experience.{' '}
            <Link href="/cookies" className="text-indigo-400 hover:text-indigo-300 underline">Cookie Policy</Link>
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={reject}
            className="text-xs px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white transition-colors"
          >
            Essential only
          </button>
          <button
            onClick={accept}
            className="text-xs px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
