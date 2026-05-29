import ComplianceClient from './ComplianceClient';
import Link from 'next/link';

export const metadata = { title: 'Compliance — Vigmis' };

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Compliance & Licenses</h1>
          <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">← Back</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-6">
        <ComplianceClient />
      </main>
    </div>
  );
}
