'use client';

import { useState, useTransition } from 'react';
import { inviteMember, revokeInvite, removeMember } from './actions';

type Member = { id: string; clerk_user_id: string; role: string; created_at: string };
type Invite = { id: string; invitee_email: string; status: string; created_at: string; expires_at: string };
type TeamData = {
  owner: { clerk_user_id: string; email: string | null };
  members: Member[];
  pendingInvites: Invite[];
  seats: { used: number; max: number };
  plan: 'free' | 'pro';
};

export default function TeamClient({ initial }: { initial: TeamData }) {
  const [data, setData] = useState(initial);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const planName = data.plan === 'pro' ? 'Scale' : 'Grow';
  const atLimit = data.seats.used >= data.seats.max;

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await inviteMember(email);
        setSuccess(`Invitation sent to ${email}`);
        setEmail('');
        // Refresh
        const { getTeam } = await import('./actions');
        setData(await getTeam());
      } catch (err: unknown) {
        try { setError(JSON.parse((err as Error).message)?.error ?? (err as Error).message); }
        catch { setError((err as Error).message); }
      }
    });
  }

  async function handleRevoke(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await revokeInvite(id);
        const { getTeam } = await import('./actions');
        setData(await getTeam());
      } catch (err: unknown) {
        setError((err as Error).message);
      }
    });
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this team member? They will lose access immediately.')) return;
    setError(null);
    startTransition(async () => {
      try {
        await removeMember(id);
        const { getTeam } = await import('./actions');
        setData(await getTeam());
      } catch (err: unknown) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="space-y-8">

      {/* Seats */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-900">{planName} plan</p>
            <p className="text-sm text-slate-500 mt-0.5">
              {data.seats.used} of {data.seats.max} seat{data.seats.max === 1 ? '' : 's'} used
            </p>
          </div>
          {atLimit && data.plan === 'free' && (
            <a href="/billing" className="text-xs bg-indigo-600 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
              Upgrade to Scale
            </a>
          )}
        </div>
        <div className="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all"
            style={{ width: `${Math.min(100, (data.seats.used / data.seats.max) * 100)}%` }}
          />
        </div>
      </div>

      {/* Current members */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Members</h2>
        <div className="space-y-2">
          {/* Owner */}
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{data.owner.email ?? 'Workspace owner'}</p>
              <p className="text-xs text-slate-400 mt-0.5">Owner</p>
            </div>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-semibold">You</span>
          </div>

          {data.members.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 font-mono text-xs">{m.clerk_user_id}</p>
                <p className="text-xs text-slate-400 mt-0.5">Member · joined {new Date(m.created_at).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleRemove(m.id)}
                disabled={pending}
                className="text-xs text-red-500 hover:text-red-700 font-semibold disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}

          {data.members.length === 0 && (
            <p className="text-sm text-slate-400 px-4 py-3">No additional members yet.</p>
          )}
        </div>
      </div>

      {/* Invite */}
      {!atLimit && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Invite a team member</h2>
          <form onSubmit={handleInvite} className="flex gap-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              type="submit"
              disabled={pending || !email}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
            >
              {pending ? 'Sending…' : 'Send invite'}
            </button>
          </form>
        </div>
      )}

      {atLimit && (
        <p className="text-sm text-slate-500">
          {data.plan === 'free'
            ? 'Grow plan allows 1 user. Upgrade to Scale to invite up to 3 team members.'
            : 'Scale plan allows up to 3 users. You have reached the limit.'}
        </p>
      )}

      {/* Pending invites */}
      {data.pendingInvites.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Pending invitations</h2>
          <div className="space-y-2">
            {data.pendingInvites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{inv.invitee_email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Sent {new Date(inv.created_at).toLocaleDateString()} · expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={pending}
                  className="text-xs text-slate-500 hover:text-red-600 font-semibold disabled:opacity-40"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>}
      {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">{success}</div>}
    </div>
  );
}
