import Link from "next/link";
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export const metadata = { title: "Privacy Policy — Vigmis" };

const LAST_UPDATED = "June 10, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-slate-400 text-sm mb-12">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10 text-slate-600 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">1. Who We Are (Data Controller)</h2>
            <p className="mb-2">
              The Vigmis platform is operated by <strong>Taurus Management and Investments Ltd.</strong> (טאורוס ניהול והשקעות בע"מ),
              Company No. 514565118, registered in Israel, with offices at 25 Mabshovitz Binyamin St., Herzliya 4640525, Israel
              (<strong>"Vigmis"</strong>, <strong>"we"</strong>, <strong>"us"</strong>).
            </p>
            <p className="mb-2">
              We are the <strong>Data Controller</strong> for personal data collected through vigmis.com and the Vigmis dashboard.
              For all privacy-related inquiries: <a href="mailto:privacy@vigmis.com" className="text-indigo-600 hover:underline">privacy@vigmis.com</a>.
            </p>
            <p className="text-sm text-slate-400">
              Note: The contracting entity may update to VIGMIS US LLC (Wyoming, USA) once that entity is established. This policy will be updated accordingly and users will be notified.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">2. Information We Collect</h2>

            <p className="mb-2 font-semibold text-slate-800">Account &amp; identity data</p>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>Name and email address — provided during sign-up via Clerk (our authentication provider)</li>
              <li>Profile preferences and notification settings</li>
            </ul>

            <p className="mb-2 font-semibold text-slate-800">Business &amp; onboarding data</p>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>Business name, website URL, industry, and description</li>
              <li>Advertising budget, campaign goals, and geographic targeting preferences</li>
              <li>Brand assets, tone of voice, and creative preferences you provide</li>
              <li>Information about your products, services, and target audience</li>
            </ul>

            <p className="mb-2 font-semibold text-slate-800">Ad platform credentials</p>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>OAuth access tokens for Google Ads, Meta (Facebook/Instagram), and TikTok Ads</li>
              <li>We store tokens in encrypted form and use them solely to manage your campaigns</li>
              <li>Campaign performance data retrieved from connected platforms</li>
            </ul>

            <p className="mb-2 font-semibold text-slate-800">Usage and technical data</p>
            <ul className="list-disc list-inside space-y-1 mb-4">
              <li>Dashboard interactions, features used, and session activity</li>
              <li>IP address, browser type, and device information</li>
              <li>System logs for error diagnosis and security monitoring</li>
            </ul>

            <p className="mb-2 font-semibold text-slate-800">Billing data</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Payment is processed entirely by Stripe. We do not store or access your credit card numbers.</li>
              <li>We retain billing history (amounts charged, invoices) for tax and legal compliance.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">3. Legal Basis for Processing (GDPR)</h2>
            <p className="mb-3">For users in the European Economic Area (EEA) and United Kingdom, we process personal data on the following legal bases:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Contract performance (Art. 6(1)(b) GDPR):</strong> Processing your account information, business data, and ad platform credentials is necessary to provide the Vigmis service you have subscribed to.</li>
              <li><strong>Legitimate interests (Art. 6(1)(f) GDPR):</strong> We process usage data, logs, and aggregated analytics to improve service quality, diagnose errors, and ensure security — where these interests are not overridden by your rights.</li>
              <li><strong>Legal obligation (Art. 6(1)(c) GDPR):</strong> We retain billing records and audit logs as required by applicable tax and financial regulations.</li>
              <li><strong>Consent (Art. 6(1)(a) GDPR):</strong> Where you have opted in to WhatsApp or email performance alerts, we rely on your consent, which you may withdraw at any time from Dashboard → Settings → Notifications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">4. How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Creating, launching, and optimising advertising campaigns on your behalf</li>
              <li>Generating AI-powered campaign strategies, creative content, and performance analysis</li>
              <li>Calculating and charging our management fee via Stripe</li>
              <li>Sending performance alerts via WhatsApp and email (only where you have opted in)</li>
              <li>Providing customer support and responding to your requests</li>
              <li>Improving our AI models and platform features using anonymised, aggregated data</li>
              <li>Detecting and preventing fraud, abuse, and security incidents</li>
              <li>Complying with legal and regulatory obligations</li>
            </ul>
            <p className="mt-3">We do not use your data for advertising to third parties and we do not sell your personal data.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">5. Data Sharing &amp; Sub-processors</h2>
            <p className="mb-3">We do not sell your data. We share data only with the third-party providers listed below, each of whom is contractually bound to process your data only as instructed and to maintain appropriate security:</p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 pr-4 font-semibold text-slate-800">Provider</th>
                    <th className="text-left py-2 pr-4 font-semibold text-slate-800">Purpose</th>
                    <th className="text-left py-2 font-semibold text-slate-800">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="py-2 pr-4 font-medium">Clerk</td><td className="py-2 pr-4">Authentication &amp; user identity</td><td className="py-2">USA</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Supabase</td><td className="py-2 pr-4">Database &amp; file storage</td><td className="py-2">USA / EU</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Stripe</td><td className="py-2 pr-4">Payment processing &amp; invoicing</td><td className="py-2">USA</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Railway</td><td className="py-2 pr-4">Application hosting &amp; infrastructure</td><td className="py-2">USA</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Cloudflare</td><td className="py-2 pr-4">CDN, image storage (R2), DDoS protection</td><td className="py-2">Global</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">OpenAI</td><td className="py-2 pr-4">AI content generation &amp; analysis</td><td className="py-2">USA</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Anthropic</td><td className="py-2 pr-4">AI strategy &amp; campaign intelligence</td><td className="py-2">USA</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Google (Ads, Analytics)</td><td className="py-2 pr-4">Campaign management &amp; performance data</td><td className="py-2">Global</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Meta (Facebook/Instagram)</td><td className="py-2 pr-4">Campaign management &amp; performance data</td><td className="py-2">USA / Ireland</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">TikTok</td><td className="py-2 pr-4">Campaign management &amp; performance data</td><td className="py-2">USA / Singapore</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Twilio</td><td className="py-2 pr-4">WhatsApp alert delivery (opt-in only)</td><td className="py-2">USA</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">SendGrid (Twilio)</td><td className="py-2 pr-4">Transactional email delivery</td><td className="py-2">USA</td></tr>
                  <tr><td className="py-2 pr-4 font-medium">Taurus Management Ltd.</td><td className="py-2 pr-4">Software development &amp; infrastructure operations (sub-processor)</td><td className="py-2">Israel</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">6. International Data Transfers</h2>
            <p className="mb-3">
              Vigmis is operated from Israel, and your data may be processed in the United States and other countries where our sub-processors operate.
              These countries may have data protection laws that differ from those in your home country.
            </p>
            <p className="mb-3">
              <strong>Israel:</strong> The European Commission has recognised Israel as providing an adequate level of data protection for personal data transferred from the EEA (Adequacy Decision 2011/61/EU). Transfers to Israel do not require additional safeguards.
            </p>
            <p>
              <strong>United States and other countries:</strong> Where we transfer data to sub-processors in countries without an adequacy decision,
              we rely on Standard Contractual Clauses (SCCs) approved by the European Commission, or on other lawful transfer mechanisms.
              You may request a copy of the applicable transfer safeguards by contacting <a href="mailto:privacy@vigmis.com" className="text-indigo-600 hover:underline">privacy@vigmis.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">7. Data Retention</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Account &amp; campaign data:</strong> Retained for the duration of your account. Upon account deletion, data is permanently removed within 30 days.</li>
              <li><strong>Billing &amp; invoice records:</strong> Retained for 7 years as required by applicable tax laws, even after account deletion.</li>
              <li><strong>Security &amp; audit logs:</strong> Retained for 12 months for fraud prevention and incident response.</li>
              <li><strong>Ad platform OAuth tokens:</strong> Deleted immediately upon account deletion or platform disconnection.</li>
              <li><strong>Anonymised aggregated data:</strong> May be retained indefinitely for service improvement purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">8. Your Rights</h2>

            <p className="mb-3 font-semibold text-slate-800">Rights under GDPR (EEA &amp; UK users)</p>
            <ul className="list-disc list-inside space-y-2 mb-5">
              <li><strong>Right of access (Art. 15):</strong> Request a copy of all personal data we hold about you.</li>
              <li><strong>Right to rectification (Art. 16):</strong> Request correction of inaccurate or incomplete data.</li>
              <li><strong>Right to erasure (Art. 17):</strong> Request deletion of your data, subject to our legal retention obligations.</li>
              <li><strong>Right to data portability (Art. 20):</strong> Receive your data in a structured, machine-readable format.</li>
              <li><strong>Right to object (Art. 21):</strong> Object to processing based on legitimate interests.</li>
              <li><strong>Right to restrict processing (Art. 18):</strong> Request that we limit how we process your data in certain circumstances.</li>
              <li><strong>Right to withdraw consent:</strong> Where processing is based on consent, withdraw it at any time without affecting the lawfulness of prior processing.</li>
              <li><strong>Right to lodge a complaint:</strong> You have the right to lodge a complaint with your local supervisory authority (e.g. the ICO in the UK, or your national DPA within the EU).</li>
            </ul>

            <p className="mb-3 font-semibold text-slate-800">Rights under CCPA (California residents)</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Right to know:</strong> Request disclosure of the personal information we have collected about you and the purposes for collection.</li>
              <li><strong>Right to delete:</strong> Request deletion of personal information we have collected, subject to legal exceptions.</li>
              <li><strong>Right to opt-out of sale:</strong> We do not sell personal information. No opt-out is necessary.</li>
              <li><strong>Right to non-discrimination:</strong> We will not discriminate against you for exercising your privacy rights.</li>
            </ul>

            <p className="mt-4">To exercise any of the above rights, contact us at <a href="mailto:privacy@vigmis.com" className="text-indigo-600 hover:underline">privacy@vigmis.com</a>. We will respond within 30 days (GDPR) or 45 days (CCPA).</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">9. Cookies &amp; Tracking</h2>
            <p className="mb-3">We use the following cookies and similar technologies:</p>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Essential cookies:</strong> Required for authentication and session management, provided by Clerk. Cannot be disabled without affecting core functionality.</li>
              <li><strong>Security cookies:</strong> Used to detect and prevent fraudulent activity.</li>
            </ul>
            <p className="mt-3">We do not use advertising cookies, third-party tracking pixels, or behavioural profiling cookies. We do not use Google Analytics or similar tracking tools on our marketing pages.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">10. Children&apos;s Privacy</h2>
            <p>The Vigmis platform is intended for use by businesses and professionals aged 18 and over. We do not knowingly collect personal data from individuals under 18. If you believe a minor has provided us with personal data, please contact us at <a href="mailto:privacy@vigmis.com" className="text-indigo-600 hover:underline">privacy@vigmis.com</a> and we will delete it promptly.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">11. Data Deletion</h2>
            <p className="mb-3">To delete your account and all associated data:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Go to <strong>Dashboard → Settings → Danger Zone → Delete Account</strong></li>
              <li>Or email <a href="mailto:privacy@vigmis.com" className="text-indigo-600 hover:underline">privacy@vigmis.com</a></li>
            </ul>
            <p className="mt-3">Upon deletion, your campaigns are paused, all platform OAuth connections are revoked, and your data is permanently removed within 30 days. Billing records are retained as required by law.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">12. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. For material changes, we will notify you by email or via an in-app notice at least 14 days before the changes take effect. The current version is always available at vigmis.com/privacy. Continued use of the Service after the effective date constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">13. Contact</h2>
            <p className="mb-2">For all privacy-related requests and inquiries:</p>
            <p>
              <a href="mailto:privacy@vigmis.com" className="text-indigo-600 hover:underline font-medium">privacy@vigmis.com</a><br />
              <span className="text-slate-500 text-sm">Taurus Management and Investments Ltd., 25 Mabshovitz Binyamin St., Herzliya 4640525, Israel</span>
            </p>
          </section>

        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
