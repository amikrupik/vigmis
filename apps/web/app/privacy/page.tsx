import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Privacy Policy — Vigmis" };

const LAST_UPDATED = "April 18, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
        <Link href="/"><Image src="/logo_nav.png" alt="Vigmis" width={200} height={44} /></Link>
        <Link href="/sign-in" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-slate-400 text-sm mb-12">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10 text-slate-600 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">1. Who We Are</h2>
            <p className="mb-2">Vigmis is a product operated by <strong>Taurus Management and Investments Ltd.</strong> (טאורוס ניהול והשקעות בע"מ), Company No. 514565118, registered in Israel.</p>
            <p className="mb-2">Registered address: 25 Mabshovitz Binyamin St., Herzliya, 4640525, Israel.</p>
            <p>This Privacy Policy explains how we collect, use, and protect your information when you use our services at vigmis.com. For privacy inquiries: <a href="mailto:privacy@vigmis.com" className="text-indigo-600 hover:underline">privacy@vigmis.com</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">2. Information We Collect</h2>
            <p className="mb-3"><strong>Account information:</strong> Name, email address, and authentication data provided via Clerk (our auth provider).</p>
            <p className="mb-3"><strong>Business information:</strong> Website URL, advertising budget, campaign goals, geographic targeting, and other information you provide during onboarding.</p>
            <p className="mb-3"><strong>Ad platform credentials:</strong> OAuth tokens for Google Ads, Meta Ads, and TikTok Ads. We store these securely and use them only to manage your campaigns.</p>
            <p className="mb-3"><strong>Usage data:</strong> How you interact with the dashboard, which features you use, and campaign performance data.</p>
            <p><strong>Billing information:</strong> Payment is processed by Stripe. We do not store credit card numbers.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>To create and manage advertising campaigns on your behalf</li>
              <li>To provide AI-powered strategy, analysis, and optimization</li>
              <li>To send performance alerts via WhatsApp and email (only with your consent)</li>
              <li>To calculate and charge our 7% management fee via Stripe</li>
              <li>To improve our AI models and service quality</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">4. Data Sharing</h2>
            <p className="mb-3">We do not sell your personal data. We share data only with:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Ad platforms</strong> (Google, Meta, TikTok) — necessary to manage your campaigns</li>
              <li><strong>Clerk</strong> — authentication provider</li>
              <li><strong>Supabase</strong> — database and file storage</li>
              <li><strong>Stripe</strong> — payment processing</li>
              <li><strong>AI providers</strong> (Anthropic, OpenAI) — to power our analysis features. Data sent is limited to business context, not personal user data.</li>
              <li><strong>Twilio / SendGrid</strong> — alert delivery (only if you enable alerts)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">5. Data Security</h2>
            <p>All data is stored in encrypted databases. OAuth tokens are stored securely and never exposed. We use HTTPS for all communications. Access is restricted to authorized personnel only.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">6. Your Rights</h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Access the data we hold about you</li>
              <li>Request deletion of your account and all associated data</li>
              <li>Disconnect your ad platforms at any time</li>
              <li>Opt out of alert notifications</li>
              <li>Export your campaign data</li>
            </ul>
            <p className="mt-3">To exercise these rights, contact us at <a href="mailto:privacy@vigmis.com" className="text-indigo-600">privacy@vigmis.com</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">7. Cookies</h2>
            <p>We use essential cookies for authentication (via Clerk) and session management. We do not use tracking or advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">8. Data Retention</h2>
            <p>We retain your data for as long as your account is active. Upon account deletion, your data is permanently removed within 30 days, except where retention is required by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">9. Contact</h2>
            <p>For privacy-related requests: <a href="mailto:privacy@vigmis.com" className="text-indigo-600">privacy@vigmis.com</a></p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">Home</Link>
          <Link href="/about" className="hover:text-slate-600">About</Link>
          <Link href="/contact" className="hover:text-slate-600">Contact</Link>
          <Link href="/faq" className="hover:text-slate-600">FAQ</Link>
          <Link href="/terms" className="hover:text-slate-600">Terms of Service</Link>
          <Link href="/cookies" className="hover:text-slate-600">Cookie Policy</Link>
          <Link href="/refund" className="hover:text-slate-600">Refund Policy</Link>
          <Link href="/acceptable-use" className="hover:text-slate-600">Acceptable Use</Link>
          <span>© {new Date().getFullYear()} Taurus Management and Investments Ltd.</span>
        </div>
      </footer>
    </div>
  );
}
