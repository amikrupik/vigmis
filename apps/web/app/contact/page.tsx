import Link from "next/link";
import ContactForm from "./ContactForm";
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export const metadata = { title: "Contact — Vigmis" };

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      <main className="flex-1 max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-black text-slate-900 mb-3">Contact Us</h1>
        <p className="text-slate-500 mb-10">We respond within 1–2 business days. For faster help, use the AI assistant inside your dashboard.</p>

        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <p className="text-xl mb-2">💬</p>
            <h3 className="font-bold text-slate-900 mb-1 text-sm">AI Assistant (instant)</h3>
            <p className="text-xs text-slate-500 mb-2">Inside your dashboard — available 24/7</p>
            <Link href="/dashboard" className="text-indigo-600 font-semibold text-xs hover:text-indigo-700">Open Dashboard →</Link>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <p className="text-xl mb-2">📖</p>
            <h3 className="font-bold text-slate-900 mb-1 text-sm">Help Center</h3>
            <p className="text-xs text-slate-500 mb-2">Answers to common questions</p>
            <Link href="/faq" className="text-indigo-600 font-semibold text-xs hover:text-indigo-700">Browse FAQ →</Link>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-8">
          <h2 className="font-bold text-slate-900 mb-6">Send us a message</h2>
          <ContactForm />
        </div>

        <div className="mt-10 text-center text-xs text-slate-400 space-y-1">
          <p className="font-medium text-slate-500">Taurus Management and Investments Ltd. (טאורוס ניהול והשקעות בע"מ)</p>
          <p>Company No. 514565118 · 25 Mabshovitz Binyamin St., Herzliya 4640525, Israel</p>
          <p><a href="mailto:legal@vigmis.com" className="hover:text-slate-600">legal@vigmis.com</a></p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
