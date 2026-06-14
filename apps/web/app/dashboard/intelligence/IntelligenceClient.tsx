'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  getInsights, dismissInsight, refreshInsights,
  getReadiness, runReadinessAudit,
  getBriefingPrefs, updateBriefingPrefs, sendBriefingNow,
  getCrisisCheck,
  getWeeklyStrategy, runWeeklyStrategy,
} from './actions';

export default function IntelligenceClient() {
  const [insights, setInsights] = useState<any[]>([]);
  const [readiness, setReadiness] = useState<any | null>(null);
  const [briefings, setBriefings] = useState<any | null>(null);
  const [weeklyStrategy, setWeeklyStrategy] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const t = useTranslations('dashboard');

  async function load() {
    setLoading(true);
    const [ins, rd, bp, ws] = await Promise.all([getInsights(), getReadiness(), getBriefingPrefs(), getWeeklyStrategy()]);
    setInsights(ins?.insights ?? []);
    setReadiness(rd ?? null);
    setBriefings(bp?.preferences ?? null);
    setWeeklyStrategy(ws?.analysis ?? null);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-20 text-center text-slate-400">{t('status.loading')}</div>;

  return (
    <div className="space-y-8">
      {status && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-2 rounded-xl">{status}</div>}

      {/* ─── Conversion Readiness ──────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('intelligence.convReadiness')}</h2>
          <button
            onClick={() => startTransition(async () => {
              setStatus(t('intelligence.auditing'));
              await runReadinessAudit();
              await load();
              setStatus(t('intelligence.auditRefreshed'));
            })}
            className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
          >
            {t('intelligence.reaudit')}
          </button>
        </div>
        {!readiness ? (
          <p className="text-sm text-slate-400">{t('intelligence.noAudit')}</p>
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
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('intelligence.issues')}</p>
                <ul className="space-y-2">
                  {readiness.report.issues.map((iss: any, i: number) => (
                    <li key={i} className={`text-xs leading-relaxed border-l-2 pl-3 ${iss.severity === 'blocking' ? 'border-rose-400' : iss.severity === 'warning' ? 'border-amber-400' : 'border-slate-300'}`}>
                      <span className={`inline-block text-[10px] font-bold uppercase tracking-wide mr-1.5 ${iss.severity === 'blocking' ? 'text-rose-600' : iss.severity === 'warning' ? 'text-amber-600' : 'text-slate-400'}`}>[{iss.severity}]</span>
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
          <h2 className="text-base font-bold text-slate-900">{t('intelligence.recurringInsights')}</h2>
          <button
            onClick={() => startTransition(async () => {
              setStatus(t('intelligence.miningThemes'));
              await refreshInsights();
              await load();
              setStatus(t('intelligence.insightsRefreshed'));
            })}
            className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
          >
            {t('common.refresh')}
          </button>
        </div>
        {insights.length === 0 ? (
          <p className="text-sm text-slate-400">{t('intelligence.noInsights')}</p>
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
                  aria-label={`${t('intelligence.dismiss')}: ${ins.theme}`}
                >
                  {t('intelligence.dismiss')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Briefings ─────────────────────────────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">{t('intelligence.briefingsTitle')}</h2>
          <button
            onClick={() => startTransition(async () => {
              setStatus(t('intelligence.sendingBriefing'));
              const r = await sendBriefingNow();
              setStatus(r?.sent ? t('intelligence.briefingSent') : `${t('intelligence.skipped')}: ${r?.reason ?? t('intelligence.noSignal')}`);
            })}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg"
          >
            {t('intelligence.sendNow')}
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
          <h2 className="text-base font-bold text-slate-900">{t('intelligence.crisisTitle')}</h2>
          <button
            onClick={() => startTransition(async () => {
              const r = await getCrisisCheck();
              if (r?.decision?.is_crisis) {
                setStatus(`⚠ ${t('intelligence.crisis')}: ${r.decision.reason}`);
              } else {
                setStatus(`${t('intelligence.ok')} — ${r?.decision?.reason ?? t('intelligence.noDeviation')}`);
              }
            })}
            className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
          >
            {t('intelligence.runCheck')}
          </button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{t('intelligence.crisisDesc')}</p>
      </section>

      {/* ─── Weekly Strategy (Strategic Brain) ─────────────────────────── */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t('intelligence.weeklyStrategyTitle')}</h2>
            {weeklyStrategy?.week_of && (
              <p className="text-xs text-slate-400 mt-0.5">{t('intelligence.weekOf')}: {weeklyStrategy.week_of}</p>
            )}
          </div>
          <button
            onClick={() => startTransition(async () => {
              setStatus(t('intelligence.analyzingPortfolio'));
              const r = await runWeeklyStrategy();
              if (r?.analysis) setWeeklyStrategy(r.analysis);
              setStatus(r?.ok ? t('intelligence.strategyUpdated') : t('intelligence.strategyFailed'));
            })}
            className="text-xs border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
          >
            {t('intelligence.runAnalysis')}
          </button>
        </div>

        {!weeklyStrategy ? (
          <p className="text-sm text-slate-400">{t('intelligence.noStrategy')}</p>
        ) : (
          <div className="space-y-5">
            {/* Verdict badge */}
            <div className="flex items-center gap-3">
              <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide ${
                weeklyStrategy.portfolio_verdict === 'on_track'  ? 'bg-emerald-100 text-emerald-700' :
                weeklyStrategy.portfolio_verdict === 'ahead'     ? 'bg-blue-100 text-blue-700' :
                weeklyStrategy.portfolio_verdict === 'behind'    ? 'bg-amber-100 text-amber-700' :
                weeklyStrategy.portfolio_verdict === 'pivot_needed' ? 'bg-rose-100 text-rose-700' :
                'bg-slate-100 text-slate-500'
              }`}>
                {weeklyStrategy.portfolio_verdict?.replace(/_/g, ' ')}
              </span>
              {!weeklyStrategy.hypothesis_still_valid && (
                <span className="text-xs font-semibold text-rose-600">{t('intelligence.hypothesisDrift')}</span>
              )}
            </div>

            {weeklyStrategy.hypothesis_drift && (
              <p className="text-sm text-slate-600 leading-relaxed border-l-2 border-amber-400 pl-3">{weeklyStrategy.hypothesis_drift}</p>
            )}

            {/* Top insights */}
            {weeklyStrategy.top_insights?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('intelligence.topInsights')}</p>
                <ul className="space-y-1.5">
                  {weeklyStrategy.top_insights.map((insight: string, i: number) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-slate-400 shrink-0">{i + 1}.</span>
                      <span>{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Top actions */}
            {weeklyStrategy.top_actions?.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{t('intelligence.topActions')}</p>
                <ul className="space-y-3">
                  {weeklyStrategy.top_actions.map((a: any, i: number) => (
                    <li key={i} className="border border-slate-100 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          a.urgency === 'now'       ? 'bg-rose-100 text-rose-700' :
                          a.urgency === 'this_week' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>{a.urgency?.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mb-0.5">{a.action}</p>
                      <p className="text-xs text-slate-500">{a.rationale}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Budget + Creative recommendations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {weeklyStrategy.budget_recommendation && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('intelligence.budgetRec')}</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{weeklyStrategy.budget_recommendation}</p>
                </div>
              )}
              {weeklyStrategy.creative_recommendation && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{t('intelligence.creativeRec')}</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{weeklyStrategy.creative_recommendation}</p>
                </div>
              )}
            </div>
          </div>
        )}
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
  const t = useTranslations('dashboard');

  function toggle(c: string) {
    setChannels((curr) => curr.includes(c) ? curr.filter((x) => x !== c) : [...curr, c]);
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        {t('intelligence.briefingsEnabled')}
      </label>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-xs text-slate-500">{t('intelligence.cadence')}:</label>
        {(['daily', 'weekly', 'never'] as const).map((c) => (
          <button key={c} onClick={() => setCadence(c)} className={`text-xs px-2.5 py-1 rounded-full border ${cadence === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{c}</button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-xs text-slate-500">{t('intelligence.channels')}:</label>
        {(['email', 'whatsapp'] as const).map((c) => (
          <button key={c} onClick={() => toggle(c)} className={`text-xs px-2.5 py-1 rounded-full border ${channels.includes(c) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{c}</button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-xs text-slate-500">{t('settings.language')}:</label>
        {(['en', 'he', 'ar', 'ru'] as const).map((c) => (
          <button key={c} onClick={() => setLanguage(c)} className={`text-xs px-2.5 py-1 rounded-full border ${language === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{c.toUpperCase()}</button>
        ))}
      </div>
      <button
        onClick={() => onSave({ cadence, channels, language, enabled })}
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl"
      >
        {t('intelligence.savePrefs')}
      </button>
    </div>
  );
}
