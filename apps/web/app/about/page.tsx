import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "About — Vigmis" };

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
        <Link href="/"><Image src="/logo.png" alt="Vigmis" width={100} height={36} /></Link>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
          <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">Get started →</Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-black text-slate-900 mb-6">About Vigmis</h1>

        <div className="prose prose-slate max-w-none space-y-6 text-slate-600 leading-relaxed">
          <p className="text-xl text-slate-700 font-medium">
            Vigmis is an AI-powered advertising manager that handles your Google, Meta, and TikTok campaigns so you can focus on running your business.
          </p>

          <h2 className="text-2xl font-bold text-slate-900 mt-10">Our Mission</h2>
          <p>
            Digital advertising is complex, expensive, and time-consuming. Most businesses either overpay agencies, waste money on poorly managed self-serve accounts, or simply don't advertise at all.
          </p>
          <p>
            Vigmis changes this. We built an AI that works like a senior performance marketer — it interviews you, researches your market, builds a campaign strategy, creates your ad content, and optimizes your spend every single day.
          </p>

          <h2 className="text-2xl font-bold text-slate-900 mt-10">How It Works</h2>
          <p>
            You connect your ad accounts. Our AI interviews you about your business, goals, and budget. It then scans your website, researches your market, and builds a campaign plan tailored to your specific needs. You review and approve — then Vigmis launches and manages everything automatically.
          </p>
          <p>
            You stay in control: you can review every decision, request changes, pause campaigns, and adjust settings anytime from the dashboard.
          </p>

          <h2 className="text-2xl font-bold text-slate-900 mt-10">Global by Design</h2>
          <p>
            Vigmis works in every market. It auto-detects your territory and adapts: currency, CPC benchmarks, upcoming holidays, cultural tone, and competitor intelligence — all localized to your specific market, whether you're in Tel Aviv, Berlin, São Paulo, or New York.
          </p>

          <h2 className="text-2xl font-bold text-slate-900 mt-10">Pricing</h2>
          <p>
            We charge 7% of the ad spend we manage. No monthly fees, no setup costs. You pay the ad platforms directly — Google, Meta, TikTok — and Vigmis charges only for the portion it actively manages.
          </p>
        </div>

        <div className="mt-16 bg-indigo-50 border border-indigo-100 rounded-2xl p-8 text-center">
          <h3 className="text-xl font-bold text-slate-900 mb-2">Start with a free marketing analysis</h3>
          <p className="text-slate-500 text-sm mb-6">AI strategy, competitor research & campaign plan — free. Then 7% only when campaigns are live.</p>
          <Link href="/sign-up" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-xl transition-colors">
            Get your free analysis →
          </Link>
        </div>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">Home</Link>
          <Link href="/faq" className="hover:text-slate-600">FAQ</Link>
          <Link href="/contact" className="hover:text-slate-600">Contact</Link>
          <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-600">Terms of Service</Link>
          <Link href="/refund" className="hover:text-slate-600">Refund Policy</Link>
          <span>© {new Date().getFullYear()} Taurus Management and Investments Ltd.</span>
        </div>
      </footer>
    </div>
  );
}
