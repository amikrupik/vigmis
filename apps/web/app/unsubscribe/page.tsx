import { Suspense } from 'react';
import UnsubscribeContent from './UnsubscribeContent';

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><p className="text-slate-400">Loading…</p></div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}
