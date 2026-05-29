'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ALL_CAPS: Array<'publish' | 'optimize' | 'generation' | 'crons'> = ['publish', 'optimize', 'generation', 'crons'];

export default function AdminFreezeClient() {
  const [secret, setSecret] = useState('');
  const [adminId, setAdminId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [reason, setReason] = useState('');
  const [caps, setCaps] = useState<Set<string>>(new Set(ALL_CAPS));
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function call(action: 'freeze' | 'unfreeze' | 'state'): Promise<void> {
    if (!secret || !tenantId) { setMessage('Need secret + tenant id.'); return; }
    setBusy(true);
    setMessage(null);
    try {
      const url = `${API_URL}/admin/tenants/${tenantId}/${action}`;
      const method = action === 'state' ? 'GET' : 'POST';
      const body = action === 'freeze' ? JSON.stringify({ reason, capabilities: Array.from(caps) }) : undefined;
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret,
          'x-admin-id': adminId || 'admin',
        },
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(`Failed: ${json.error ?? res.status}`);
      } else if (action === 'state') {
        setStatus(json);
      } else {
        setMessage(`Done: ${JSON.stringify(json)}`);
        await call('state');
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function toggleCap(c: string) {
    setCaps((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Credentials</h2>
        <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="ADMIN_SECRET" type="password" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <input value={adminId} onChange={(e) => setAdminId(e.target.value)} placeholder="Your Clerk user id (for audit log)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Tenant</h2>
        <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant UUID" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" />
        <button onClick={() => call('state')} disabled={busy} className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg">Get state</button>
      </div>

      <div className="bg-white border border-rose-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-rose-700">Freeze</h2>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit trail)" rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
        <div className="flex gap-2 flex-wrap">
          {ALL_CAPS.map((c) => (
            <label key={c} className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer ${caps.has(c) ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-500'}`}>
              <input type="checkbox" checked={caps.has(c)} onChange={() => toggleCap(c)} className="hidden" />
              {c}
            </label>
          ))}
        </div>
        <button onClick={() => call('freeze')} disabled={busy} className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl">Freeze tenant</button>
      </div>

      <div className="bg-white border border-emerald-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-emerald-700 mb-3">Unfreeze</h2>
        <button onClick={() => call('unfreeze')} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-xl">Unfreeze tenant</button>
      </div>

      {message && <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs font-mono">{message}</div>}
      {status && (
        <pre dir="ltr" className="bg-slate-900 text-slate-100 text-xs p-4 rounded-xl overflow-auto max-h-96">{JSON.stringify(status, null, 2)}</pre>
      )}
    </div>
  );
}
