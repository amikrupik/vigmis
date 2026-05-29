import AdminFreezeClient from './AdminFreezeClient';

export const metadata = { title: 'Admin — Freeze · Vigmis' };

// This page is shipped as part of the app but is gated by knowledge of
// ADMIN_SECRET — without it, the API rejects every action.
export default function AdminFreezePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-lg font-bold">Vigmis Admin — Tenant Freeze</h1>
          <p className="text-xs text-slate-400">Internal use only. Requires ADMIN_SECRET.</p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-6">
        <AdminFreezeClient />
      </main>
    </div>
  );
}
