'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-6 p-6">
      <Image src="/logo_nav.png" alt="Vigmis" width={200} height={44} priority />
      <div className="text-center space-y-2">
        <p className="text-6xl font-black text-slate-200">500</p>
        <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
        <p className="text-slate-500 text-sm">An unexpected error occurred. Please try again.</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
        >
          Try again
        </button>
        <Link href="/dashboard" className="bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
