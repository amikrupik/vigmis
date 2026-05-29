'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  getInsights, dismissInsight, refreshInsights,
  getReadiness, runReadinessAudit,
  getBriefingPrefs, updateBriefingPrefs, sendBriefingNow,
  getCrisisCheck,
} from './actions';

export default function IntelligenceClient() {
  const [insights, setInsights] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any | null>(null);
  const [briefings, setBriefings] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [ins, rd, bp] = await Promise.all([getInsights(), getReadiness(), getBriefingPrefs()]);
    setInsights(ins?.insights ?? []);
    setReadiness(rd ?? null);
    setBriefings(bp?.preferences ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-20 text-center text-slate-400">Loading…</div>;

  return (
    <div className="space-y-8">
      {status && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2 rounded-xl">{status}</div>}

      {/* ─── Conversion Readiness ──────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Conversion Readiness</h2>
          <button
            onClick={() => startTransition(async () => {
              setStatus('Auditing your landing page…');
              await runReadinessAudit();
              await load();
              setStatus('Audit refreshed.');
            })}
            className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
          >
            Re-audit
          </button>
        </div>
        {!readiness ? (
          <p className="text-sm text-slate-400">No audit yet. Click Re-audit to run one.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-black ${readiness.score >= 75 ? 'text-emerald-600' : readiness.score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>{readiness.score}</span>
              <span className="text-sm text-slate-500">/ 100</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${readiness.report?.verdict === 'ready' ? 'bg-emerald-100 text-emerald-700' : readiness.report?.verdict === 'fix_before_ads' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{readiness.report?.verdict?.replace('_', ' ')}</span>
            </div>
            {readiness.report?.reasoning && <p className="text-sm text-slate-600 leading-relaxed">{readiness.report.reasoning}</p>}
            {readiness.report?.issues?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Issues</p>
                <ul className="space-y-2">
                  {readiness.report.issues.map((iss: any, i: number) => (
                    <li key={i} className={`text-xs leading-relaxed border-l-2 pl-3 ${iss.severity === 'blocking' ? 'border-rose-400' : iss.severity === 'warning' ? 'border-amber-400' : 'border-slate-300'}`}>
                      <strong className="text-slate-700">{iss.category}: </strong>
                      <span className="text-slate-600">{iss.finding}</span>
                      <br />
                      <span className="text-slate-500">→ {iss.fix}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── Insights ──────────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Recurring Insights</h2>
          <button
            onClick={() => startTransition(async () => {
              setStatus('Mining recurring themes from your comments…');
              await refreshInsights();
              await load();
              setStatus('Insights refreshed.');
            })}
            className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
          >
            Refresh
          </button>
        </div>
        {insights.length === 0 ? (
          <p className="text-sm text-slate-400">No recurring patterns yet. Vigmis needs more comment volume to surface insights.</p>
        ) : (
          <ul className="space-y-2.5">
            {insights.map((ins) => (
              <li key={ins.id} className="border border-slate-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      ins.insight_kind === 'recurring_objection' ? 'bg-amber-100 text-amber-700' :
                      ins.insight_kind === 'recurring_complaint' ? 'bg-rose-100 text-rose-700' :
                      ins.insight_kind === 'recurring_question' ? 'bg-blue-100 text-blue-700' :
                      ins.insight_kind === 'praise_theme' ? 'bg-emerald-100 text-emerald-700' :
                      ins.insight_kind === 'faq_candidate' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>{ins.insight_kind.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-slate-400">×{ins.occurrence_count}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mb-0.5"><bdi>{ins.theme}</bdi></p>
                  {ins.suggested_action && <p className="text-xs text-slate-500 leading-relaxed">→ <bdi>{ins.suggested_action}</bdi></p>}
                </div>
                <button
                  onClick={async () => { await dismissInsight(ins.id); setInsights((p) => p.filter((x) => x.id !== ins.id)); }}
                  className="text-xs text-slate-400 hover:text-slate-700"
                >
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Briefings ─────────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Proactive Briefings (WhatsApp + Email)</h2>
          <button
            onClick={() => startTransition(async () => {
              setStatus('Sending a briefing now…');
              const r = await sendBriefingNow();
              setStatus(r?.sent ? 'Briefing sent.' : `Skipped: ${r?.reason ?? 'no signal'}`);
            })}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg"
          >
            Send now
          </button>
        </div>
        <BriefingPrefsForm initial={briefings} onSave={async (next) => {
          await updateBriefingPrefs(next);
          setStatus('Saved.');
          await load();
        }} />
      </section>

      {/* ─── Crisis check ──────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Sentiment Velocity (Crisis Check)</h2>
          <button
            onClick={() => startTransition(async () => {
              const r = await getCrisisCheck();
              if (r?.decision?.is_crisis) {
                setStatus(`⚠ Crisis: ${r.decision.reason}`);
              } else {
                setStatus(`OK — ${r?.decision?.reason ?? 'no significant deviation'}`);
              }
            })}
            className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
          >
            Run check
          </button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">Vigmis tracks your daily comment sentiment against a 7-day baseline. If negative comments spike beyond 2.5σ, you get a critical alert.</p>
      </section>
    </div>
  );
}

function BriefingPrefsForm({ initial, onSave }: { initial: any; onSave: (next: Record<string, unknown>) => void }) {
  const p = initial ?? { cadence: 'weekly', channels: ['email'], language: 'en', delivery_hour: 9, weekly_day_of_week: 1, enabled: true };
  const [cadence, setCadence] = useState(p.cadence);
  const [channels, setChannels] = useState<string[]>(p.channels ?? ['email']);
  const [language, setLanguage] = useState(p.language ?? 'en');
  const [enabled, setEnabled] = useState(p.enabled ?? true);

  function toggle(c: string) {
    setChannels((curr) => curr.includes(c) ? curr.filter((x) => x !== c) : [...curr, c]);
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Briefings enabled
      </label>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-xs text-slate-500">Cadence:</label>
        {(['daily', 'weekly', 'never'] as const).map((c) => (
          <button key={c} onClick={() => setCadence(c)} className={`text-xs px-2.5 py-1 rounded-full border ${cadence === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{c}</button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-xs text-slate-500">Channels:</label>
        {(['email', 'whatsapp'] as const).map((c) => (
          <button key={c} onClick={() => toggle(c)} className={`text-xs px-2.5 py-1 rounded-full border ${channels.includes(c) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{c}</button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-xs text-slate-500">Language:</label>
        {(['en', 'he', 'ar', 'ru'] as const).map((c) => (
          <button key={c} onClick={() => setLanguage(c)} className={`text-xs px-2.5 py-1 rounded-full border ${language === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{c.toUpperCase()}</button>
        ))}
      </div>
      <button
        onClick={() => onSave({ cadence, channels, language, enabled })}
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl"
      >
        Save preferences
      </button>
    </div>
  );
}
