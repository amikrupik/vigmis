'use client';

import { useState, useEffect, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getCreativeJobs,
  generateCreativeJob,
  pollCreativeStatus,
  approveCreative,
  rejectCreative,
  type CreativeJob,
} from './actions';

const KEEP_OPTIONS = [
  { value: 'logo', label: 'Logo' },
  { value: 'product', label: 'Product' },
  { value: 'face', label: 'Face / Person' },
  { value: 'background', label: 'Background' },
  { value: 'text', label: 'Text / CTA' },
  { value: 'colors', label: 'Colors' },
];

const TYPE_LABELS: Record<string, string> = {
  avatar: 'Avatar Video',
  cinematic: 'Cinematic Video',
  animation: 'Animation Video',
  image: 'Image Creative',
};

const TYPE_PRICES: Record<string, string> = {
  avatar: '$15/video',
  cinematic: '$12/video',
  animation: '$8/video',
  image: '$5/image',
};

const REVISION_50PCT_PRICES: Record<string, string> = {
  avatar: '$7.50',
  cinematic: '$6.00',
  animation: '$4.00',
  image: '$2.50',
};

const STATUS_BADGE: Record<string, string> = {
  queued: 'bg-blue-100 text-blue-700',
  processing: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  pending_setup: 'bg-slate-100 text-slate-500',
  rejected: 'bg-slate-100 text-slate-400',
};

// Group jobs into chains: each root job (no parent) is a chain head,
// its children (revisions) are listed chronologically
function buildChains(jobs: CreativeJob[]): Array<{ root: CreativeJob; revisions: CreativeJob[] }> {
  const byId = new Map(jobs.map(j => [j.id, j]));
  const roots: CreativeJob[] = [];
  const childrenOf = new Map<string, CreativeJob[]>();

  for (const job of jobs) {
    if (!job.parent_job_id) {
      roots.push(job);
    } else {
      const siblings = childrenOf.get(job.parent_job_id) ?? [];
      siblings.push(job);
      childrenOf.set(job.parent_job_id, siblings);
    }
  }

  return roots.map(root => ({
    root,
    revisions: (childrenOf.get(root.id) ?? []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
  }));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// New Creative form component
function NewCreativeForm({ onSubmit, onCancel }: {
  onSubmit: (params: any) => void;
  onCancel: () => void;
}) {
  const [creativeType, setCreativeType] = useState<'avatar' | 'cinematic' | 'animation' | 'image'>('image');
  const [prompt, setPrompt] = useState('');
  const [script, setScript] = useState('');
  const [platform, setPlatform] = useState('meta');

  function handleSubmit() {
    const brief: Record<string, any> = creativeType === 'avatar'
      ? { script }
      : { prompt };

    onSubmit({ type: creativeType, brief, platform });
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      <h3 className="font-bold text-slate-900 text-lg">New Creative</h3>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['image', 'animation', 'cinematic', 'avatar'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setCreativeType(t)}
              className={`border-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${creativeType === t ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
            >
              <span className="block font-semibold">{TYPE_LABELS[t]}</span>
              <span className="block text-xs mt-0.5 opacity-70">{TYPE_PRICES[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Platform</label>
        <select
          value={platform}
          onChange={e => setPlatform(e.target.value)}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="meta">Meta (Facebook / Instagram)</option>
          <option value="google">Google</option>
          <option value="tiktok">TikTok</option>
        </select>
      </div>

      {creativeType === 'avatar' ? (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Avatar Script</label>
          <textarea
            value={script}
            onChange={e => setScript(e.target.value)}
            placeholder="What should the avatar say? Write a short script (30-90 seconds)..."
            rows={5}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Creative Brief / Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the creative you want... Include product, target audience, mood, and any specific elements."
            rows={5}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={creativeType === 'avatar' ? !script.trim() : !prompt.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Generate
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Revision form — keep/change
function RevisionForm({ onSubmit, onCancel }: {
  onSubmit: (keepElements: string[], changeRequest: string) => void;
  onCancel: () => void;
}) {
  const [keepElements, setKeepElements] = useState<string[]>(['logo', 'product']);
  const [changeRequest, setChangeRequest] = useState('');

  function toggleKeep(value: string) {
    setKeepElements(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value],
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-4">
      <h4 className="font-semibold text-slate-900">Request Revision</h4>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">What to KEEP exactly:</p>
        <div className="grid grid-cols-3 gap-2">
          {KEEP_OPTIONS.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={keepElements.includes(opt.value)}
                onChange={() => toggleKeep(opt.value)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">What to CHANGE:</label>
        <textarea
          value={changeRequest}
          onChange={e => setChangeRequest(e.target.value)}
          placeholder="Describe what you want changed..."
          rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onSubmit(keepElements, changeRequest)}
          disabled={!changeRequest.trim()}
          className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          Submit Revision
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border border-slate-200 hover:bg-white text-slate-600 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Single creative card with version timeline
function CreativeChain({
  chain,
  onApprove,
  onReject,
  onRevise,
  onRestore,
  approvingId,
  rejectingId,
}: {
  chain: { root: CreativeJob; revisions: CreativeJob[] };
  onApprove: (job: CreativeJob) => void;
  onReject: (job: CreativeJob) => void;
  onRevise: (job: CreativeJob) => void;
  onRestore: (job: CreativeJob) => void;
  approvingId: string | null;
  rejectingId: string | null;
}) {
  const { root, revisions } = chain;
  const all = [root, ...revisions];
  const latest = all[all.length - 1];
  const [showHistory, setShowHistory] = useState(false);
  const [compareIdx, setCompareIdx] = useState<number | null>(null);

  const isApproved = !!latest.approved_at;
  const completedJobs = all.filter(j => j.status === 'completed');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{TYPE_LABELS[latest.type]}</span>
          {latest.platform && (
            <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{latest.platform}</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[latest.status]}`}>
            {latest.status}
          </span>
          {isApproved && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Approved</span>
          )}
          {latest.credit_consumed && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">Credit used</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>V{all.length}</span>
          <span className="text-slate-200">|</span>
          <span>{formatDate(latest.created_at)}</span>
        </div>
      </div>

      {/* Preview + actions */}
      <div className="p-5 space-y-4">
        {/* Output preview */}
        {latest.output_url && latest.status === 'completed' && (
          <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-100">
            {latest.type === 'image' ? (
              <img
                src={latest.output_url}
                alt="Creative output"
                className="w-full max-h-64 object-contain"
              />
            ) : (
              <video
                src={latest.output_url}
                controls
                className="w-full max-h-64"
              />
            )}
          </div>
        )}

        {latest.status === 'processing' || latest.status === 'queued' ? (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-700 text-center">
            Generating your creative... This usually takes a few minutes.
          </div>
        ) : null}

        {latest.status === 'pending_setup' && (
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm text-slate-500 text-center">
            Provider not yet configured. Your brief is saved.
          </div>
        )}

        {latest.status === 'failed' && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-600 text-center">
            Generation failed. You can try again with a revision.
          </div>
        )}

        {/* Critic score */}
        {typeof latest.critic_score === 'number' && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium">AI Critic score:</span>
            <span className={`font-bold ${latest.critic_score >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {Math.round(latest.critic_score * 100)}/100
            </span>
            <span>{latest.critic_score >= 0.75 ? '(passed)' : '(borderline)'}</span>
          </div>
        )}

        {/* Actions */}
        {latest.status === 'completed' && !isApproved && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApprove(latest)}
              disabled={approvingId === latest.id}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              {approvingId === latest.id ? 'Processing...' : latest.revision_number >= 3 ? `Approve (50% — ${REVISION_50PCT_PRICES[latest.type] ?? '$2.50'})` : 'Approve (free)'}
            </button>
            <button
              type="button"
              onClick={() => onRevise(latest)}
              className="border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 rounded-xl text-sm transition-colors"
            >
              Request Revision
            </button>
            <button
              type="button"
              onClick={() => onReject(latest)}
              disabled={rejectingId === latest.id}
              className="text-slate-400 hover:text-red-500 font-medium px-3 py-2 rounded-xl text-sm transition-colors"
            >
              Discard
            </button>
          </div>
        )}

        {isApproved && (
          <div className="text-sm text-emerald-600 font-medium">
            Approved on {formatDate(latest.approved_at!)}. This creative is locked.
          </div>
        )}
      </div>

      {/* Version timeline */}
      {all.length > 1 && (
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={() => setShowHistory(h => !h)}
            className="text-sm text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {showHistory ? 'Hide' : 'View'} version history ({all.length} versions)
          </button>

          {showHistory && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {all.map((job, idx) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => setCompareIdx(compareIdx === idx ? null : idx)}
                    className={`flex-shrink-0 border-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${compareIdx === idx ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    V{idx + 1}
                    <span className={`block mt-0.5 text-[10px] ${STATUS_BADGE[job.status].split(' ')[1]}`}>
                      {job.status}
                    </span>
                  </button>
                ))}
              </div>

              {compareIdx !== null && (
                <div className="mt-3 p-4 bg-slate-50 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      V{compareIdx + 1} — {formatDate(all[compareIdx].created_at)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[all[compareIdx].status]}`}>
                      {all[compareIdx].status}
                    </span>
                  </div>

                  {all[compareIdx].output_url && (
                    <div className="rounded-lg overflow-hidden border border-slate-200">
                      {all[compareIdx].type === 'image' ? (
                        <img src={all[compareIdx].output_url!} alt={`V${compareIdx + 1}`} className="w-full max-h-48 object-contain" />
                      ) : (
                        <video src={all[compareIdx].output_url!} controls className="w-full max-h-48" />
                      )}
                    </div>
                  )}

                  {all[compareIdx].change_request && (
                    <p className="text-xs text-slate-500">
                      <span className="font-medium">Change requested:</span> {all[compareIdx].change_request}
                    </p>
                  )}

                  {all[compareIdx].keep_elements && all[compareIdx].keep_elements.length > 0 && (
                    <p className="text-xs text-slate-500">
                      <span className="font-medium">Kept:</span> {all[compareIdx].keep_elements.join(', ')}
                    </p>
                  )}

                  {all[compareIdx].status === 'completed' && !all[compareIdx].approved_at && (
                    <button
                      type="button"
                      onClick={() => onRestore(all[compareIdx])}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Restore this version (create new revision from this brief)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function StudioClient() {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<CreativeJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [revisingJob, setRevisingJob] = useState<CreativeJob | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const approvedParam = searchParams.get('approved');

  // Initial load + handle ?approved= URL param
  useEffect(() => {
    loadJobs();
    if (approvedParam) {
      setSuccessMsg('Creative approved successfully.');
      window.history.replaceState({}, '', '/studio');
    }
  }, []);

  // Auto-poll while any job is processing/queued
  useEffect(() => {
    const inProgress = jobs.some(j => j.status === 'queued' || j.status === 'processing');
    if (!inProgress) return;
    const timer = setTimeout(loadJobs, 5_000);
    return () => clearTimeout(timer);
  }, [jobs]);

  // Auto-dismiss success message after 4 seconds
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4_000);
    return () => clearTimeout(t);
  }, [successMsg]);

  async function loadJobs() {
    setLoading(true);
    try {
      const list = await getCreativeJobs();
      setJobs(list);
    } catch {
      setError('Failed to load creatives');
    } finally {
      setLoading(false);
    }
  }

  function handleGenerate(params: any) {
    setShowNewForm(false);
    setError(null);
    startTransition(async () => {
      try {
        await generateCreativeJob(params);
        await loadJobs();
        setSuccessMsg('Creative generation started.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed');
      }
    });
  }

  function handleRevisionSubmit(keepElements: string[], changeRequest: string) {
    if (!revisingJob) return;
    const parentJob = revisingJob;
    setRevisingJob(null);
    setError(null);
    startTransition(async () => {
      try {
        await generateCreativeJob({
          type: parentJob.type,
          brief: parentJob.brief,
          platform: parentJob.platform ?? undefined,
          parent_job_id: parentJob.parent_job_id ?? parentJob.id,
          keep_elements: keepElements,
          change_request: changeRequest,
        });
        await loadJobs();
        setSuccessMsg('Revision submitted.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Revision failed');
      }
    });
  }

  function handleRestore(job: CreativeJob) {
    setError(null);
    startTransition(async () => {
      try {
        await generateCreativeJob({
          type: job.type,
          brief: job.brief,
          platform: job.platform ?? undefined,
          parent_job_id: job.parent_job_id ?? job.id,
          change_request: 'Restore to this version',
        });
        await loadJobs();
        setSuccessMsg('Restore revision submitted.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Restore failed');
      }
    });
  }

  function handleApprove(job: CreativeJob) {
    setApprovingId(job.id);
    setError(null);
    startTransition(async () => {
      try {
        const result = await approveCreative(job.id);
        if (result.checkout_url) {
          window.location.href = result.checkout_url;
          return;
        }
        await loadJobs();
        setSuccessMsg('Creative approved.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Approval failed');
      } finally {
        setApprovingId(null);
      }
    });
  }

  function handleReject(job: CreativeJob) {
    setRejectingId(job.id);
    setError(null);
    startTransition(async () => {
      try {
        await rejectCreative(job.id);
        await loadJobs();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Discard failed');
      } finally {
        setRejectingId(null);
      }
    });
  }

  const chains = buildChains(jobs.filter(j => j.status !== 'rejected'));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-slate-400 hover:text-slate-700 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </a>
            <h1 className="font-bold text-slate-900 text-lg">Creative Studio</h1>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/settings/brand"
              className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
            >
              Brand DNA
            </a>
            <button
              type="button"
              onClick={() => { setShowNewForm(true); setRevisingJob(null); }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              New Creative
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 font-medium">
            {successMsg}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {isPending && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-600 flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin inline-block" />
            Working...
          </div>
        )}

        {/* New creative form */}
        {showNewForm && (
          <NewCreativeForm
            onSubmit={handleGenerate}
            onCancel={() => setShowNewForm(false)}
          />
        )}

        {/* Revision form */}
        {revisingJob && (
          <RevisionForm
            onSubmit={handleRevisionSubmit}
            onCancel={() => setRevisingJob(null)}
          />
        )}

        {/* Creative chains */}
        {chains.length === 0 && !showNewForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </div>
            <p className="font-semibold text-slate-800">No creatives yet</p>
            <p className="text-sm text-slate-400">Create your first AI-generated image or video creative.</p>
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              Create first creative
            </button>
          </div>
        )}

        {chains.map(chain => (
          <div key={chain.root.id}>
            <CreativeChain
              chain={chain}
              onApprove={handleApprove}
              onReject={handleReject}
              onRevise={job => { setRevisingJob(job); setShowNewForm(false); }}
              onRestore={handleRestore}
              approvingId={approvingId}
              rejectingId={rejectingId}
            />
          </div>
        ))}

      </div>
    </div>
  );
}
