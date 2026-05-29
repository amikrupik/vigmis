import Link from 'next/link';
import IntelligenceClient from './IntelligenceClient';

export const metadata = { title: 'Intelligence — Vigmis' };

export default function IntelligencePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Intelligence</h1>
          <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">← Back to dashboard</Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        <IntelligenceClient />
      </main>
    </div>
  );
}
