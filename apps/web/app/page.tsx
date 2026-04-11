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
            Get started free →
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
          Vigmis runs your Google, Meta, and TikTok ads autonomously — strategy, creative, budget, and optimization. You grow. We handle the rest.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-10">
          <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-4 rounded-2xl text-base transition-colors shadow-lg shadow-indigo-200">
            Start for free →
          </Link>
          <Link href="/sign-in" className="border border-slate-200 text-slate-700 hover:border-slate-300 font-semibold px-8 py-4 rounded-2xl text-base transition-colors">
            Sign in
          </Link>
        </div>
        <p className="text-xs text-slate-400 mt-4">No credit card required · 7% of managed spend · Cancel anytime</p>
      </section>

      {/* Features */}
      <section className="px-6 py-20 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-slate-900 text-center mb-4">Everything your campaigns need</h2>
          <p className="text-slate-500 text-center mb-12 text-base">One platform. Every platform.</p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
            {[
              { icon: '🎯', title: 'AI Campaign Strategy', desc: 'AI interviews you, scans your website, and builds a data-driven campaign plan.' },
              { icon: '🎬', title: 'Video Creative', desc: 'AI-generated talking avatar, cinematic, and animation videos — ready in minutes.' },
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
      <section className="px-6 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-black text-slate-900 mb-4">Simple, performance-based pricing</h2>
          <p className="text-slate-500 mb-10">You pay the ad platforms directly. We charge 7% of what we manage.</p>
          <div className="bg-white border-2 border-indigo-200 rounded-2xl p-8 shadow-md shadow-indigo-50">
            <p className="text-5xl font-black text-indigo-600 mb-1">7%</p>
            <p className="text-slate-500 mb-6">of managed ad spend · no monthly fees</p>
            <ul className="text-left space-y-3 text-sm text-slate-700 mb-8">
              {['Full AI campaign management', 'Google + Meta + TikTok', 'Video creative generation', 'Real-time alerts & analytics', 'Cancel anytime'].map(f => (
                <li key={f} className="flex items-center gap-2"><span className="text-indigo-500 font-bold">✓</span>{f}</li>
              ))}
            </ul>
            <Link href="/sign-up" className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-colors text-center">
              Get started free →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Image src="/logo.png" alt="Vigmis" width={80} height={28} />
          <div className="flex items-center gap-6 text-xs text-slate-400">
            <Link href="/about" className="hover:text-slate-600">About</Link>
            <Link href="/contact" className="hover:text-slate-600">Contact</Link>
            <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-600">Terms of Service</Link>
          </div>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Vigmis. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
