import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import PublicNav from './components/PublicNav';
import PublicFooter from './components/PublicFooter';

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    // Authenticated — check onboarding status
    try {
      const { getToken } = await auth();
      const token = await getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${apiUrl}/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        redirect(data.onboardingComplete ? "/dashboard" : "/onboarding");
      } else {
        redirect("/dashboard");
      }
    } catch {
      redirect("/dashboard");
    }
  }

  // Not authenticated — show landing page
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <PublicNav />

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full mb-8 uppercase tracking-wider">
          AI-Powered Ad Management
        </div>
        <h1 className="text-5xl sm:text-6xl font-black text-slate-900 leading-tight max-w-3xl">
          AI platform that creates<br />
          <span className="text-indigo-600">and manages your ad campaigns</span>
        </h1>
        <p className="text-lg text-slate-500 mt-6 max-w-xl leading-relaxed">
          Connect your Google & Meta accounts. Vigmis handles strategy, creatives, budget optimization, and reporting — automatically. You pay the ad platforms directly. We charge only a small management fee.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-10">
          <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-4 rounded-2xl text-base transition-colors shadow-lg shadow-indigo-200">
            Get Started →
          </Link>
          <Link href="/demo" className="border-2 border-indigo-200 hover:border-indigo-400 text-indigo-700 font-bold px-8 py-4 rounded-2xl text-base transition-colors">
            Try Demo (no signup) →
          </Link>
        </div>
        <p className="text-xs text-slate-400 mt-4">7% of managed spend · Cancel anytime</p>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 bg-white border-t border-slate-100">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-black text-slate-900 text-center mb-10">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            {[
              { step: '1', title: 'Connect your accounts', desc: 'Link your Google Ads and Meta accounts. Vigmis reads your existing setup and understands your business in minutes.' },
              { step: '2', title: 'AI builds your strategy', desc: 'Vigmis interviews you, scans your website, researches your market, and creates a complete campaign plan — for your approval.' },
              { step: '3', title: 'Campaigns run automatically', desc: 'Vigmis launches, monitors, and optimises your campaigns 24/7. Budget shifts to top performers. You get weekly reports.' },
            ].map(s => (
              <div key={s.step} className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-black text-lg flex items-center justify-center mb-4">{s.step}</div>
                <h3 className="font-bold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/demo" className="inline-flex items-center gap-2 text-indigo-600 font-bold text-sm hover:underline">
              See it live — Try Demo (no signup required) →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-slate-900 text-center mb-4">Everything your campaigns need</h2>
          <p className="text-slate-500 text-center mb-12 text-base">One platform. Every platform.</p>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: '🎯', title: 'AI Campaign Strategy', desc: 'AI interviews you, scans your website, and builds a data-driven campaign plan.' },
              { icon: '🎬', title: 'Video Creative', desc: 'AI-generated talking avatar, cinematic, and animation videos — ready in minutes.' },
              { icon: '📱', title: 'Social Media Posts', desc: 'Weekly Facebook, Instagram, and TikTok posts — written and published by AI, approved by you.' },
              { icon: '💬', title: 'Community Management', desc: 'Vigmis reads your comments, handles the easy ones, and drafts replies for the rest — you approve in one click.' },
              { icon: '📊', title: 'Analytics & ROAS', desc: 'Real-time spend, CPA, CTR, and ROAS across all platforms in one dashboard.' },
              { icon: '🔔', title: 'Smart Alerts', desc: 'WhatsApp and email alerts when campaigns need attention — before you lose money.' },
              { icon: '🌍', title: 'Territory Intelligence', desc: 'Auto-detects your market: currency, CPC benchmarks, holidays, and local tone.' },
              { icon: '⚡', title: 'Budget Optimization', desc: 'AI shifts budget to top performers in real time. Every dollar works harder.' },
            ].map(f => (
              <div key={f.title} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold text-slate-900 mb-1.5">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="px-6 py-20 bg-slate-50" id="pricing">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-black text-slate-900 mb-4">Simple, performance-based pricing</h2>
          <p className="text-slate-500 mb-10">You pay the ad platforms directly. We charge a small percentage of what we manage — nothing else.</p>

          <div className="grid sm:grid-cols-2 gap-6 text-left mb-8">
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-8">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Grow</p>
              <p className="text-5xl font-black text-slate-900 mb-1">7%</p>
              <p className="text-slate-500 text-sm mb-5">of managed spend · no subscription</p>
              <ul className="space-y-2 text-sm text-slate-600">
                {['5 active campaigns','Google, Meta & TikTok','Weekly AI briefing','1 user'].map(f => (
                  <li key={f} className="flex items-center gap-2"><span className="text-slate-400">✓</span>{f}</li>
                ))}
              </ul>
            </div>
            <div className="bg-white border-2 border-indigo-500 rounded-2xl p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">Most popular</div>
              <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-3">Scale</p>
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-5xl font-black text-slate-900">6%</p>
                <p className="text-slate-500 text-sm">+ $49/mo</p>
              </div>
              <p className="text-slate-500 text-sm mb-5">of managed spend · billed monthly</p>
              <ul className="space-y-2 text-sm text-slate-700">
                {['30 active campaigns','6× daily optimization','Daily AI briefing','1 video + 5 creatives / month','Up to 3 users'].map(f => (
                  <li key={f} className="flex items-center gap-2"><span className="text-indigo-500">✓</span>{f}</li>
                ))}
              </ul>
            </div>
          </div>

          <Link href="/pricing" className="inline-block border-2 border-indigo-200 hover:border-indigo-400 text-indigo-700 font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
            See full pricing & add-ons →
          </Link>
          <p className="text-xs text-slate-400 mt-4">Cancel anytime</p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-slate-50 border-t border-slate-100 px-6 py-6">
        <p className="max-w-3xl mx-auto text-xs text-slate-400 text-center leading-relaxed">
          <strong className="text-slate-500">Disclaimer:</strong> Vigmis is an AI marketing manager that continuously analyzes, optimizes, and adjusts your campaigns. As with all digital advertising, results cannot be predicted — they depend on market conditions, seasonality, competitor activity, and platform algorithms beyond our control. Vigmis operates on a best-effort basis and does not guarantee specific outcomes. You retain full control and can pause or modify your campaigns at any time.{' '}
          <Link href="/terms" className="underline hover:text-slate-600">Full Terms →</Link>
        </p>
      </section>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}
