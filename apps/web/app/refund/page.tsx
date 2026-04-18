import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Refund & Cancellation Policy — Vigmis" };

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
        <Link href="/"><Image src="/logo.png" alt="Vigmis" width={100} height={36} /></Link>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Refund & Cancellation Policy</h1>
        <p className="text-slate-400 text-sm mb-10">Last updated: April 18, 2026</p>

        <div className="space-y-8 text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Vigmis subscription fees</h2>
            <p className="mb-3">Vigmis charges a monthly management fee based on your managed ad spend. This fee is <strong>non-refundable</strong> once the billing period has started, as the AI optimization work is performed continuously throughout the month.</p>
            <p>If you believe you were charged in error, contact us within 7 days and we will review your case.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Ad platform spend (Google, Meta, TikTok)</h2>
            <p className="mb-3">Vigmis does <strong>not</strong> hold or process your ad spend. Money flows directly between you and the ad platforms (Google, Meta, TikTok). Refund requests for ad spend must be directed to the respective platform:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><a href="https://support.google.com/google-ads/gethelp" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google Ads Support</a></li>
              <li><a href="https://www.facebook.com/business/help" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Meta Business Help</a></li>
              <li><a href="https://ads.tiktok.com/help" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">TikTok Ads Help</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Creative production fees</h2>
            <p>Video creative production fees (AI-generated videos via HeyGen, Kling, or Pika) are non-refundable once generation has started, as we incur third-party AI costs. If a video fails to generate due to a technical error on our side, you will receive a full credit for a retry.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Cancellation</h2>
            <p className="mb-3">You can cancel your Vigmis subscription at any time from the <Link href="/dashboard" className="text-indigo-600 hover:underline">Billing page</Link> → "Manage Subscription." Cancellation takes effect at the end of the current billing period — you retain full access until then.</p>
            <p>After cancellation, your campaign data is retained for 30 days and then permanently deleted. You can export your data before cancellation from Settings → Export Data.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Exceptions & goodwill credits</h2>
            <p>We evaluate refund requests case-by-case for:</p>
            <ul className="list-disc list-inside space-y-1 text-sm mt-2">
              <li>Service outages longer than 24 hours that affected your campaigns</li>
              <li>Billing errors (duplicate charges, wrong amount)</li>
              <li>First-month new subscribers who cancel within 72 hours</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">How to request a refund</h2>
            <p>Email <a href="mailto:billing@vigmis.com" className="text-indigo-600 hover:underline">billing@vigmis.com</a> with your account email and a description of the issue. We respond within 2 business days. If unresolved, you may also contact us through the <Link href="/contact" className="text-indigo-600 hover:underline">Contact page</Link>.</p>
          </section>

        </div>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">Home</Link>
          <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-600">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-slate-600">Cookie Policy</Link>
          <Link href="/refund" className="hover:text-slate-600">Refund Policy</Link>
          <Link href="/acceptable-use" className="hover:text-slate-600">Acceptable Use</Link>
          <span>© {new Date().getFullYear()} Vigmis</span>
        </div>
      </footer>
    </div>
  );
}
