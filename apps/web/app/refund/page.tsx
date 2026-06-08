import Link from "next/link";
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export const metadata = { title: "Refund & Cancellation Policy — Vigmis" };

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Refund & Cancellation Policy</h1>
        <p className="text-slate-400 text-sm mb-10">Last updated: June 8, 2026</p>

        <div className="space-y-8 text-slate-700 leading-relaxed">

          {/* ── Cancellation paths ────────────────────── */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">How to cancel</h2>
            <p className="mb-4">Vigmis offers two distinct exit paths — choose based on what you want to achieve:</p>

            <div className="space-y-4">
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                <p className="font-semibold text-slate-800 mb-1">Option 1 — Cancel subscription (Scale plan)</p>
                <p className="text-sm mb-2">Dashboard → <Link href="/billing" className="text-indigo-600 hover:underline">Billing</Link> → "Manage Subscription" → Cancel in the Paddle portal.</p>
                <p className="text-sm text-slate-600">Your subscription ends at the close of the current billing period. <strong>You keep full access until then.</strong> Your account and all campaign data remain intact. Campaigns continue running on the Grow plan terms after the period ends.</p>
              </div>
              <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                <p className="font-semibold text-slate-800 mb-1">Option 2 — Delete account (all plans)</p>
                <p className="text-sm mb-2">Dashboard → Settings → Danger Zone → "Delete Account" → type DELETE to confirm.</p>
                <p className="text-sm text-slate-600"><strong>Immediate and permanent.</strong> All active campaigns are paused, Vigmis is disconnected from your Meta / Google / TikTok accounts, and all your data is deleted. This cannot be undone. We recommend <Link href="/dashboard" className="text-indigo-600 hover:underline">exporting your data</Link> first.</p>
              </div>
            </div>
          </section>

          {/* ── Billing obligations on cancellation ───── */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">What you owe when you cancel</h2>
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-slate-900 mb-1">Grow plan (7% of ad spend)</p>
                <p className="text-sm">You owe the management fee on all ad spend that occurred from the 1st of the current calendar month up to and including the date you cancel or delete. If you delete your account before the end-of-month invoice is generated, our billing team may contact you at your registered email address to collect the outstanding amount.</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-1">Scale plan ($49/month + 6%)</p>
                <p className="text-sm">The $49 subscription fee already charged for the current billing period is <strong>non-refundable</strong>. You also owe the 6% management fee on all ad spend accrued up to the cancellation or deletion date. If you cancel the subscription (Option 1), no further subscription fees are charged from the next period onward.</p>
              </div>
            </div>
          </section>

          {/* ── Vigmis service fees ────────────────────── */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Vigmis service fees — refund policy</h2>
            <p className="mb-3">Management fees and subscription fees are <strong>non-refundable</strong> once the billing period has started. The AI optimization system works continuously — strategy generation, campaign builds, daily optimizations, briefings, and creative production all occur throughout the month and cannot be "un-done" after the fact.</p>
            <p>If you believe you were charged in error, contact <a href="mailto:billing@vigmis.com" className="text-indigo-600 hover:underline">billing@vigmis.com</a> within 30 days of the invoice date and we will review your case.</p>
          </section>

          {/* ── Ad platform spend ─────────────────────── */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Ad platform spend (Google, Meta, TikTok)</h2>
            <p className="mb-3">Vigmis does <strong>not</strong> hold or process your ad spend. Money flows directly between you and the ad platforms. Refund requests for ad spend must be directed to the respective platform:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><a href="https://support.google.com/google-ads/gethelp" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Google Ads Support</a></li>
              <li><a href="https://www.facebook.com/business/help" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Meta Business Help</a></li>
              <li><a href="https://ads.tiktok.com/help" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">TikTok Ads Help</a></li>
            </ul>
          </section>

          {/* ── Creative production ───────────────────── */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Creative production fees</h2>
            <p>Video creative fees (AI-generated videos via HeyGen, Kling, or Pika) are non-refundable once generation has started, as we incur third-party AI costs immediately. If a video fails to generate due to a technical error on our side, you will receive a full credit for a retry.</p>
          </section>

          {/* ── Exceptions ───────────────────────────── */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Exceptions — goodwill credits</h2>
            <p className="mb-2">We review refund requests case-by-case for:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Vigmis service outages longer than 24 consecutive hours that provably affected your active campaigns</li>
              <li>Billing errors (duplicate charges, wrong amount billed)</li>
              <li>Scale plan new subscribers who cancel within 72 hours of their first payment and have not yet generated a strategy or run any campaigns</li>
            </ul>
          </section>

          {/* ── How to request ───────────────────────── */}
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">How to request a refund or dispute a charge</h2>
            <p>Email <a href="mailto:billing@vigmis.com" className="text-indigo-600 hover:underline">billing@vigmis.com</a> with your account email and a description of the issue. We respond within 2 business days. If unresolved, you may also write to us through the <Link href="/contact" className="text-indigo-600 hover:underline">Contact page</Link>.</p>
          </section>

        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
