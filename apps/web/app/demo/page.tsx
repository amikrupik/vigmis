'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// ── Demo Data ─────────────────────────────────────────────────────────────────

const CAMPAIGNS = [
  { id: '1', name: 'Search — Hotel Booking', platform: 'google', status: 'active', daily_budget_usd: 45, roas: 3.2, spend: 1215, conversions: 89, ctr: 3.1 },
  { id: '2', name: 'Meta — Room Offers', platform: 'meta', status: 'active', daily_budget_usd: 30, roas: 2.8, spend: 810, conversions: 62, ctr: 1.8 },
  { id: '3', name: 'Display — Brand Awareness', platform: 'google', status: 'active', daily_budget_usd: 15, roas: 1.4, spend: 405, conversions: 18, ctr: 0.6 },
  { id: '4', name: 'Meta — Retargeting', platform: 'meta', status: 'paused', daily_budget_usd: 20, roas: 4.1, spend: 417, conversions: 58, ctr: 2.9 },
];

const AI_ACTIONS = [
  { action: 'Scale up budget +15%', campaign: 'Search — Hotel Booking', reason: 'ROAS above target for 5 consecutive days', time: '2h ago', icon: '📈' },
  { action: 'Paused low-performer', campaign: 'Display — Brand Awareness', reason: 'CTR below 0.5% for 7 days, spend wasted', time: '6h ago', icon: '⏸' },
  { action: 'Shifted $12/day to Meta', campaign: 'Meta — Room Offers', reason: 'Weekend traffic converts 40% better on Meta', time: '1d ago', icon: '💰' },
  { action: 'Resumed campaign', campaign: 'Meta — Retargeting', reason: 'Audience refreshed, creative updated', time: '2d ago', icon: '▶️' },
  { action: 'Keyword bid adjustment', campaign: 'Search — Hotel Booking', reason: '"boutique hotel tel aviv" — +20% bid on top converter', time: '3d ago', icon: '🎯' },
];

const ALERTS = [
  { title: 'Display CTR dropping', message: 'Brand awareness campaign CTR fell to 0.4% — consider refreshing creative.', severity: 'warning' },
];

const GEO = { score: 68, grade: 'C+', delta: 12, issues: 4, strengths: 3 };

const WEEKLY = [
  { day: 'Mon', spend: 87, conversions: 14 },
  { day: 'Tue', spend: 94, conversions: 17 },
  { day: 'Wed', spend: 90, conversions: 13 },
  { day: 'Thu', spend: 102, conversions: 19 },
  { day: 'Fri', spend: 118, conversions: 22 },
  { day: 'Sat', spend: 131, conversions: 26 },
  { day: 'Sun', spend: 125, conversions: 21 },
];

const maxSpend = Math.max(...WEEKLY.map(d => d.spend));

// ── Helpers ───────────────────────────────────────────────────────────────────

function PlatformBadge({ p }: { p: string }) {
  const colors: Record<string, string> = { google: 'bg-blue-100 text-blue-700', meta: 'bg-purple-100 text-purple-700' };
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors[p] ?? 'bg-slate-100 text-slate-600'}`}>{p}</span>;
}

function StatusBadge({ s }: { s: string }) {
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{s}</span>;
}

function KpiCard({ label, value, sub, color = 'text-slate-900' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ onTab }: { onTab: (t: string) => void }) {
  const totalSpend = CAMPAIGNS.reduce((s, c) => s + c.spend, 0);
  const totalConv = CAMPAIGNS.reduce((s, c) => s + c.conversions, 0);
  const totalBudget = CAMPAIGNS.filter(c => c.status === 'active').reduce((s, c) => s + c.daily_budget_usd, 0);
  const avgRoas = CAMPAIGNS.filter(c => c.status === 'active').reduce((s, c) => s + c.roas, 0) / CAMPAIGNS.filter(c => c.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="30-day Spend" value={`$${totalSpend.toLocaleString()}`} sub="across all campaigns" />
        <KpiCard label="Conversions" value={`${totalConv}`} sub="bookings & leads" color="text-indigo-600" />
        <KpiCard label="Avg ROAS" value={`${avgRoas.toFixed(1)}x`} sub="return on ad spend" color="text-emerald-600" />
        <KpiCard label="Daily Budget" value={`$${totalBudget}/day`} sub="3 active campaigns" />
      </div>

      {/* Spend chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Daily Spend — Last 7 Days</h3>
        <div className="flex items-end gap-2 h-28">
          {WEEKLY.map(d => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-indigo-500 rounded-t-lg transition-all"
                style={{ height: `${(d.spend / maxSpend) * 100}%` }}
              />
              <p className="text-xs text-slate-400 font-medium">{d.day}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-700">Recent AI Actions</h3>
          <span className="text-xs bg-indigo-50 text-indigo-600 font-bold px-2 py-0.5 rounded-full">{AI_ACTIONS.length} this week</span>
        </div>
        <div className="space-y-3">
          {AI_ACTIONS.slice(0, 3).map((a, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-sm flex-shrink-0">{a.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{a.action}</p>
                <p className="text-xs text-slate-400">{a.campaign} · {a.reason}</p>
              </div>
              <p className="text-xs text-slate-400 flex-shrink-0">{a.time}</p>
            </div>
          ))}
        </div>
      </div>

      {/* GEO + Alert row */}
      <div className="grid sm:grid-cols-2 gap-4">
        <button onClick={() => onTab('geo')} className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-indigo-300 transition-colors">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">AI Visibility Score</p>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full border-4 flex items-center justify-center text-lg font-black ${GEO.score >= 80 ? 'border-emerald-400 text-emerald-600' : GEO.score >= 60 ? 'border-amber-400 text-amber-600' : 'border-red-400 text-red-600'}`}>
              {GEO.grade}
            </div>
            <div>
              <p className="text-xl font-black text-slate-900">{GEO.score}/100</p>
              <p className="text-xs text-emerald-600 font-bold">↑{GEO.delta} from last month</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">How ChatGPT, Claude & Gemini find your business → View report</p>
        </button>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">⚠️ Alert</p>
          <p className="text-sm font-semibold text-amber-800">{ALERTS[0].title}</p>
          <p className="text-xs text-amber-700 mt-1">{ALERTS[0].message}</p>
        </div>
      </div>
    </div>
  );
}

// ── Campaigns Tab ─────────────────────────────────────────────────────────────

function CampaignsTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Campaigns</h2>
          <p className="text-sm text-slate-400">{CAMPAIGNS.filter(c => c.status === 'active').length} active · {CAMPAIGNS.filter(c => c.status === 'paused').length} paused</p>
        </div>
        <button disabled className="bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl opacity-60 cursor-not-allowed">Launch campaign</button>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left text-xs font-bold text-slate-400 uppercase px-5 py-3">Campaign</th>
              <th className="text-left text-xs font-bold text-slate-400 uppercase px-3 py-3">Platform</th>
              <th className="text-left text-xs font-bold text-slate-400 uppercase px-3 py-3">Status</th>
              <th className="text-right text-xs font-bold text-slate-400 uppercase px-3 py-3">Budget</th>
              <th className="text-right text-xs font-bold text-slate-400 uppercase px-3 py-3">ROAS</th>
              <th className="text-right text-xs font-bold text-slate-400 uppercase px-3 py-3">Conv.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {CAMPAIGNS.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3.5 text-sm font-semibold text-slate-800">{c.name}</td>
                <td className="px-3 py-3.5"><PlatformBadge p={c.platform} /></td>
                <td className="px-3 py-3.5"><StatusBadge s={c.status} /></td>
                <td className="px-3 py-3.5 text-sm text-slate-600 text-right">${c.daily_budget_usd}/day</td>
                <td className={`px-3 py-3.5 text-sm font-bold text-right ${c.roas >= 3 ? 'text-emerald-600' : c.roas >= 2 ? 'text-amber-500' : 'text-red-500'}`}>{c.roas}x</td>
                <td className="px-3 py-3.5 text-sm text-slate-600 text-right">{c.conversions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 text-center">In demo mode, campaign controls are disabled. Sign up to manage real campaigns.</p>
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const totalSpend = CAMPAIGNS.reduce((s, c) => s + c.spend, 0);
  const totalConv = CAMPAIGNS.reduce((s, c) => s + c.conversions, 0);
  const totalImpressions = 284500;
  const totalClicks = 6820;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Total Spend" value={`$${totalSpend.toLocaleString()}`} sub="last 30 days" />
        <KpiCard label="Impressions" value={totalImpressions.toLocaleString()} sub="↑18% vs last month" color="text-indigo-600" />
        <KpiCard label="CTR" value="2.4%" sub="↑0.3pp vs last month" color="text-emerald-600" />
        <KpiCard label="CPA" value="$15.22" sub="↓$2.10 vs last month" color="text-emerald-600" />
      </div>

      {/* Conversions chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Daily Conversions</h3>
        <div className="flex items-end gap-2 h-24">
          {WEEKLY.map(d => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-emerald-400 rounded-t-lg"
                style={{ height: `${(d.conversions / 26) * 100}%` }}
              />
              <p className="text-xs text-slate-400">{d.day}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign breakdown */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Campaign Performance</h3>
        <div className="space-y-3">
          {CAMPAIGNS.filter(c => c.status === 'active').map(c => (
            <div key={c.id} className="flex items-center gap-4">
              <PlatformBadge p={c.platform} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-slate-700">{c.name}</p>
                  <p className={`text-sm font-bold ${c.roas >= 3 ? 'text-emerald-600' : 'text-amber-500'}`}>{c.roas}x ROAS</p>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full">
                  <div className={`h-full rounded-full ${c.roas >= 3 ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${Math.min((c.roas / 4) * 100, 100)}%` }} />
                </div>
              </div>
              <p className="text-xs text-slate-400 w-20 text-right">${c.spend} spent</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── GEO Tab ───────────────────────────────────────────────────────────────────

function GeoTab() {
  const issues = [
    { severity: 'critical', text: 'Missing Schema.org LocalBusiness markup — AI cannot extract your NAP data' },
    { severity: 'critical', text: 'No FAQ section found — limits appearance in AI-generated answers' },
    { severity: 'warning', text: 'Business description too short (<50 words) for AI context building' },
    { severity: 'info', text: 'OpenGraph tags present but missing description for rich previews' },
  ];
  const strengths = [
    'Google My Business listing found and verified',
    'HTTPS and mobile-friendly — trusted by AI crawlers',
    'Product/service keywords present in H1 and meta title',
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-slate-900">AI Visibility Report</h2>
            <p className="text-sm text-slate-400 mt-1">How well ChatGPT, Claude, Gemini & Perplexity can find and recommend your business</p>
          </div>
          <div className={`w-16 h-16 rounded-full border-4 flex flex-col items-center justify-center flex-shrink-0 ${GEO.score >= 80 ? 'border-emerald-400' : GEO.score >= 60 ? 'border-amber-400' : 'border-red-400'}`}>
            <span className={`text-xl font-black ${GEO.score >= 80 ? 'text-emerald-600' : GEO.score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{GEO.grade}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-3 bg-slate-100 rounded-full">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${GEO.score}%` }} />
          </div>
          <span className="text-lg font-black text-slate-900">{GEO.score}/100</span>
          <span className="text-xs font-bold text-emerald-600">↑{GEO.delta} from last month</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Issues found ({issues.length})</h3>
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${issue.severity === 'critical' ? 'bg-red-100 text-red-600' : issue.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                  {issue.severity === 'critical' ? 'CRIT' : issue.severity === 'warning' ? 'WARN' : 'INFO'}
                </span>
                <p className="text-xs text-slate-600">{issue.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Strengths ({strengths.length})</h3>
          <div className="space-y-2">
            {strengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold flex-shrink-0">✓</span>
                <p className="text-xs text-slate-600">{s}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Generated Schema.org Code</h3>
        <p className="text-xs text-slate-400 mb-2">Add this to your website &lt;head&gt; — Vigmis generates it automatically</p>
        <pre className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 overflow-x-auto">{`{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Tel Aviv Boutique Hotel",
  "url": "https://example.com",
  "telephone": "+972-3-000-0000",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Tel Aviv",
    "addressCountry": "IL"
  },
  "priceRange": "$$",
  "openingHoursSpecification": [...]
}`}</pre>
      </div>
    </div>
  );
}

// ── Main Demo Page ────────────────────────────────────────────────────────────

type Tab = 'overview' | 'campaigns' | 'analytics' | 'geo';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'geo', label: 'AI Visibility' },
];

export default function DemoPage() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Demo Banner */}
      <div className="bg-indigo-600 text-white px-4 py-2.5 text-center text-sm font-medium">
        <span className="opacity-80">You&apos;re viewing a live demo with sample data.</span>
        {' '}
        <Link href="/sign-up" className="font-bold underline underline-offset-2 hover:opacity-90">
          Sign up free to connect your real campaigns →
        </Link>
      </div>

      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <Link href="/">
          <Image src="/logo_nav.png" alt="Vigmis" width={160} height={36} priority />
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-sm text-slate-500 hover:text-slate-800 font-medium hidden sm:block">Sign in</Link>
          <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            Get started free →
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black text-slate-900">Demo Dashboard</h1>
            <p className="text-sm text-slate-400 mt-0.5">Tel Aviv Boutique Hotel · Sample data · AI managing 3 active campaigns</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-slate-500">AI active</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'overview' && <OverviewTab onTab={t => setTab(t as Tab)} />}
        {tab === 'campaigns' && <CampaignsTab />}
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'geo' && <GeoTab />}

        {/* Bottom CTA */}
        <div className="mt-10 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-8 text-center text-white">
          <h3 className="text-xl font-black mb-2">Ready to connect your real campaigns?</h3>
          <p className="text-indigo-200 text-sm mb-5">Vigmis manages your Google, Meta & TikTok ads — autonomously. Strategy, creative, optimization, reports.</p>
          <Link href="/sign-up" className="inline-block bg-white text-indigo-700 font-bold px-8 py-3 rounded-xl hover:bg-indigo-50 transition-colors">
            Get started free →
          </Link>
          <p className="text-xs text-indigo-300 mt-3">Free AI strategy & competitor research · 7% of managed spend · Cancel anytime</p>
        </div>
      </div>
    </div>
  );
}
