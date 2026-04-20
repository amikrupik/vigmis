import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";

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
        redirect("/onboarding");
      }
    } catch {
      redirect("/onboarding");
    }
  }

  // Not authenticated — show landing page
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100 sticky top-0 bg-white/80 backdrop-blur z-20">
        <Image src="/logo.png" alt="Vigmis" width={100} height={36} priority />
        <div className="flex items-center gap-4">
          <Link href="/about" className="text-sm text-slate-500 hover:text-slate-800 font-medium hidden sm:block">About</Link>
          <Link href="/contact" className="text-sm text-slate-500 hover:text-slate-800 font-medium hidden sm:block">Contact</Link>
          <Link href="/sign-in" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
          <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            Free analysis →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full mb-8 uppercase tracking-wider">
          AI-Powered Ad Management
        </div>
        <h1 className="text-5xl sm:text-6xl font-black text-slate-900 leading-tight max-w-3xl">
          Your campaigns.<br />
          <span className="text-indigo-600">Managed by AI.</span>
        </h1>
        <p className="text-lg text-slate-500 mt-6 max-w-xl leading-relaxed">
          Vigmis runs your Google, Meta, and TikTok ads — and manages your social media — autonomously. Strategy, creative, posts, comments, budget, optimization. You grow. We handle the rest.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-10">
          <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-4 rounded-2xl text-base transition-colors shadow-lg shadow-indigo-200">
            Get your free marketing analysis →
          </Link>
          <Link href="/sign-in" className="border border-slate-200 text-slate-700 hover:border-slate-300 font-semibold px-8 py-4 rounded-2xl text-base transition-colors">
            Sign in
          </Link>
        </div>
        <p className="text-xs text-slate-400 mt-4">Free AI strategy & competitor research · Then 7% of managed spend · Cancel anytime</p>
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

      {/* Pricing */}
      <section className="px-6 py-20" id="pricing">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-black text-slate-900 mb-4">Simple, performance-based pricing</h2>
          <p className="text-slate-500 mb-10">You pay the ad platforms directly. We charge only for what we manage.</p>

          <div className="grid sm:grid-cols-2 gap-6 text-left">
            {/* Basic */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-8">
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Basic</p>
              <p className="text-5xl font-black text-slate-900 mb-1">7%</p>
              <p className="text-slate-500 text-sm mb-6">of managed spend · no monthly fee</p>
              <ul className="space-y-2.5 text-sm text-slate-600 mb-8">
                {[
                  'Free AI strategy & campaign plan',
                  'Google + Meta + TikTok management',
                  'Social posts: $1/post (FB/IG) · $3 (TikTok)',
                  'Comment management: $0.05/reply sent',
                  'Smart alerts & basic analytics',
                  'Cancel anytime',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2"><span className="text-slate-400 font-bold">✓</span>{f}</li>
                ))}
              </ul>
              <Link href="/sign-up" className="block w-full border-2 border-indigo-200 hover:border-indigo-400 text-indigo-700 font-bold py-3 rounded-xl transition-colors text-center text-sm">
                Get your free analysis →
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-white border-2 border-indigo-500 rounded-2xl p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">Most popular</div>
              <p className="text-sm font-bold text-indigo-600 uppercase tracking-wider mb-4">Pro</p>
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-5xl font-black text-slate-900">5%</p>
                <p className="text-slate-500 text-sm">+ $15/mo</p>
              </div>
              <p className="text-slate-500 text-sm mb-6">of managed spend · billed monthly</p>
              <ul className="space-y-2.5 text-sm text-slate-700 mb-8">
                {[
                  'Everything in Basic',
                  'More daily AI analyses & optimizations',
                  'Advanced analytics & ROAS tracking',
                  'Priority support',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2"><span className="text-indigo-500 font-bold">✓</span>{f}</li>
                ))}
              </ul>
              <Link href="/sign-up" className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors text-center text-sm">
                Get your free analysis →
              </Link>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-6">No credit card required · Free AI strategy & competitor research included · Cancel anytime</p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="bg-slate-50 border-t border-slate-100 px-6 py-6">
        <p className="max-w-3xl mx-auto text-xs text-slate-400 text-center leading-relaxed">
          <strong className="text-slate-500">Results Disclaimer:</strong> Advertising performance depends on many factors including competition, seasonality, landing page quality, and platform algorithms — all outside our control. Vigmis uses AI and data to maximise results, but does not guarantee specific outcomes such as ROAS, CPA, or revenue. Past performance does not guarantee future results.{' '}
          <Link href="/terms" className="underline hover:text-slate-600">Full Terms →</Link>
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Image src="/logo.png" alt="Vigmis" width={80} height={28} />
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <Link href="/about" className="hover:text-slate-600">About</Link>
            <Link href="/faq" className="hover:text-slate-600">FAQ</Link>
            <Link href="/contact" className="hover:text-slate-600">Contact</Link>
            <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-600">Terms</Link>
            <Link href="/refund" className="hover:text-slate-600">Refund</Link>
            <Link href="/cookies" className="hover:text-slate-600">Cookies</Link>
            <Link href="/acceptable-use" className="hover:text-slate-600">Acceptable Use</Link>
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Taurus Management and Investments Ltd. — Vigmis</p>
        </div>
      </footer>
    </div>
  );
}
