import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Terms of Service — Vigmis" };

const LAST_UPDATED = "April 11, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
        <Link href="/"><Image src="/logo.png" alt="Vigmis" width={100} height={36} /></Link>
        <Link href="/sign-in" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-slate-400 text-sm mb-12">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10 text-slate-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">1. Agreement</h2>
            <p>By creating an account or using the Vigmis platform ("Service"), you agree to these Terms of Service. If you do not agree, do not use the Service. These terms form a binding agreement between you and Vigmis.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">2. Service Description</h2>
            <p>Vigmis provides an AI-powered advertising management platform that automates the creation, management, and optimization of digital advertising campaigns on Google Ads, Meta Ads, and TikTok Ads. The Service includes campaign strategy generation, creative production, analytics, and performance optimization.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">3. Account Responsibilities</h2>
            <p className="mb-3">You are responsible for:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Maintaining the security of your account credentials</li>
              <li>All activity that occurs under your account</li>
              <li>Ensuring you have the right to connect the ad accounts you link to Vigmis</li>
              <li>Compliance with the advertising policies of Google, Meta, and TikTok</li>
              <li>Ensuring your advertising content complies with applicable laws</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">4. Ad Spend & Billing</h2>
            <p className="mb-3"><strong>Ad spend:</strong> You pay Google, Meta, and TikTok directly via your own billing accounts. Vigmis does not control or process payments to ad platforms.</p>
            <p className="mb-3"><strong>Vigmis fee:</strong> We charge 7% of the ad spend that Vigmis actively manages. This is billed monthly via Stripe based on the management percentage you set during onboarding.</p>
            <p><strong>Refunds:</strong> Fees are non-refundable except where required by applicable law. Ad spend refunds must be requested directly from the respective ad platform.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">5. AI-Generated Content</h2>
            <p className="mb-3">Vigmis uses AI to generate campaign strategies, ad copy, and creative content. You acknowledge that:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>AI-generated content may contain errors or inaccuracies</li>
              <li>You are responsible for reviewing and approving campaigns before launch</li>
              <li>Vigmis does not guarantee specific campaign results, ROAS, or conversion rates</li>
              <li>You retain ownership of your campaign data and creative assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">6. Video Creative Policy</h2>
            <p className="mb-3">For AI-generated videos:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>One free revision is included per video order</li>
              <li>Additional revisions are charged at $5 per revision</li>
              <li>Delivery takes 3–5 minutes from approval</li>
              <li>Videos are stored in Supabase Storage and accessible for 12 months</li>
              <li>You may not use generated videos for illegal, misleading, or harmful advertising</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">7. Prohibited Uses</h2>
            <p className="mb-3">You may not use Vigmis to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Advertise illegal products or services</li>
              <li>Run misleading, deceptive, or fraudulent ads</li>
              <li>Violate the advertising policies of Google, Meta, or TikTok</li>
              <li>Infringe third-party intellectual property rights</li>
              <li>Circumvent platform spending limits or policies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">8. No Guarantee of Results</h2>
            <p className="mb-3">Digital advertising performance is influenced by many factors outside Vigmis's control, including market competition, seasonal demand, platform algorithm changes, landing page quality, product-market fit, and macroeconomic conditions.</p>
            <p className="mb-3">Vigmis uses AI and data-driven methods to maximise the likelihood of strong campaign performance. However, <strong>we make no guarantee of specific results</strong>, including but not limited to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Return on Ad Spend (ROAS) targets</li>
              <li>Cost per Lead (CPL) or Cost per Acquisition (CPA) levels</li>
              <li>Revenue, conversion rates, or profitability</li>
              <li>Impression volumes or click-through rates</li>
            </ul>
            <p className="mt-3">Past performance of your campaigns or of similar businesses does not guarantee future results. We recommend treating advertising as a long-term investment and working with us over time to optimise based on real data.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">9. Limitation of Liability</h2>
            <p>Vigmis is not liable for ad spend losses, campaign underperformance, platform policy violations, or interruptions in third-party services (Google, Meta, TikTok). Our total liability to you for any claim shall not exceed the fees you paid to Vigmis in the 30 days preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">10. Termination</h2>
            <p>You may cancel your account at any time from the Settings page. We may suspend or terminate accounts that violate these terms. Upon termination, your data will be retained for 30 days before permanent deletion.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">11. Modifications</h2>
            <p>We may update these terms with 14 days notice via email or in-app notification. Continued use of the Service after notice constitutes acceptance of the updated terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">12. Contact</h2>
            <p>Legal notices: <a href="mailto:legal@vigmis.com" className="text-indigo-600">legal@vigmis.com</a></p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">Home</Link>
          <Link href="/about" className="hover:text-slate-600">About</Link>
          <Link href="/contact" className="hover:text-slate-600">Contact</Link>
          <Link href="/privacy" className="hover:text-slate-600">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
