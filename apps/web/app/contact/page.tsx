import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Contact — Vigmis" };

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
        <Link href="/"><Image src="/logo.png" alt="Vigmis" width={100} height={36} /></Link>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
          <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">Get started →</Link>
        </div>
      </nav>

      <main className="flex-1 max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-black text-slate-900 mb-3">Contact Us</h1>
        <p className="text-slate-500 mb-12">We're here to help. Reach out and we'll get back to you within 24 hours.</p>

        <div className="grid sm:grid-cols-2 gap-6 mb-12">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <p className="text-2xl mb-3">📧</p>
            <h3 className="font-bold text-slate-900 mb-1">Email</h3>
            <p className="text-sm text-slate-500 mb-3">For general inquiries and support</p>
            <a href="mailto:hello@vigmis.com" className="text-indigo-600 font-semibold text-sm hover:text-indigo-700">hello@vigmis.com</a>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <p className="text-2xl mb-3">💬</p>
            <h3 className="font-bold text-slate-900 mb-1">Live Chat</h3>
            <p className="text-sm text-slate-500 mb-3">Available inside the dashboard</p>
            <Link href="/sign-in" className="text-indigo-600 font-semibold text-sm hover:text-indigo-700">Open dashboard →</Link>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <p className="text-2xl mb-3">🐛</p>
            <h3 className="font-bold text-slate-900 mb-1">Bug Reports</h3>
            <p className="text-sm text-slate-500 mb-3">Found something broken?</p>
            <a href="mailto:bugs@vigmis.com" className="text-indigo-600 font-semibold text-sm hover:text-indigo-700">bugs@vigmis.com</a>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <p className="text-2xl mb-3">🤝</p>
            <h3 className="font-bold text-slate-900 mb-1">Partnerships</h3>
            <p className="text-sm text-slate-500 mb-3">Agencies and resellers</p>
            <a href="mailto:partners@vigmis.com" className="text-indigo-600 font-semibold text-sm hover:text-indigo-700">partners@vigmis.com</a>
          </div>
        </div>

        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-8 text-center">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Need help with your campaigns?</h3>
          <p className="text-slate-500 text-sm mb-4">The fastest way to get support is through the AI assistant inside your dashboard.</p>
          <Link href="/dashboard" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
            Open Dashboard →
          </Link>
        </div>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">Home</Link>
          <Link href="/about" className="hover:text-slate-600">About</Link>
          <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-600">Terms of Service</Link>
          <span>© {new Date().getFullYear()} Vigmis</span>
        </div>
      </footer>
    </div>
  );
}
