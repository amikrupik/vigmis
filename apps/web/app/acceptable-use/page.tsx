import Link from "next/link";
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export const metadata = { title: "Acceptable Use Policy — Vigmis" };

const LAST_UPDATED = "May 28, 2026";

export default function AcceptableUsePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Acceptable Use Policy</h1>
        <p className="text-slate-400 text-sm mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 text-slate-700 leading-relaxed">

          <section>
            <p className="mb-3">This policy defines what you may and may not use the Vigmis platform to advertise or publish. Violations may result in immediate account suspension <strong>without refund</strong>.</p>
            <p>Content is evaluated against three tiers of restriction. The same content may move between tiers based on the jurisdiction of the customer, the target market of the campaign, and the customer's professional licensing. Geographic awareness is built into the Vigmis policy classifier.</p>
          </section>

          <section className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3">Tier 0 — Hard Block (no exceptions)</h2>
            <p className="mb-3">The following content is blocked automatically and is not eligible for human review. Repeated attempts to publish Tier 0 content may result in immediate account termination.</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm">
              <li>Sale of illegal drugs, unregistered weapons, or other controlled goods</li>
              <li>Human trafficking, sexual exploitation, or content sexualizing minors</li>
              <li>Defamation, "lashon hara", or attacks naming a specific competitor business or individual</li>
              <li>Shaming, doxxing, or public attacks on private individuals identified by name</li>
              <li>Incitement to violence or discrimination based on race, religion, gender, ethnicity, nationality, sexual orientation, or other protected status</li>
              <li>Pyramid schemes, "get rich quick", guaranteed financial returns, or fraudulent investment claims</li>
              <li>Absolute medical claims ("cures cancer", "100% effective", "reverses diabetes")</li>
              <li>Marketing alcohol, tobacco, vaping, or gambling to minors</li>
              <li>Publishing personal identifiers (national ID, SSN, home address) of others without consent</li>
              <li>Counterfeit goods, brand impersonation, or trademark infringement</li>
              <li>Malware, phishing, or content designed to extract credentials or financial information</li>
            </ul>
          </section>

          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3">Tier 1 — Requires License & Human Review</h2>
            <p className="mb-3">The following categories are permitted only if you provide proof of professional licensing valid in every jurisdiction where your ads will run. Content is reviewed by a human before publication and may be rejected even with a license if the specific creative is non-compliant.</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm">
              <li>Gambling, casinos, sports betting (per-jurisdiction license required)</li>
              <li>Alcohol (regulatory restrictions vary by jurisdiction)</li>
              <li>Cannabis, CBD, and related products (legality varies by market; some EU jurisdictions prohibit)</li>
              <li>Dietary supplements making health claims (e.g. weight loss, muscle gain, immunity)</li>
              <li>Financial services — investment advice, lending, credit, insurance (jurisdictional licensing required)</li>
              <li>Medical services and devices (professional license required; FDA/EMA-equivalent compliance)</li>
              <li>Legal services (bar admission required in target jurisdiction)</li>
              <li>Cosmetic and aesthetic medical procedures</li>
              <li>Political advertising during regulated election windows</li>
              <li>Adoption, surrogacy, and reproductive services</li>
              <li>Religious services and faith-based programs (case-by-case review)</li>
            </ul>
          </section>

          <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3">Tier 2 — Permitted with Caveats</h2>
            <p className="mb-3">The following categories are permitted but may carry platform-specific restrictions, age targeting requirements, or required disclosures. The Vigmis policy classifier will add caveats or suggest safer wording automatically.</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm">
              <li>Dating services (age-gated; cannot target minors)</li>
              <li>Adult-adjacent products that do not violate platform policy</li>
              <li>Non-prescription weight-loss products (platforms restrict before/after imagery)</li>
              <li>Cosmetic products with non-medical claims</li>
              <li>Subscription services (must disclose recurring billing)</li>
              <li>Cryptocurrency and digital assets (per-platform and per-jurisdiction restrictions apply)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Customer content responsibility</h2>
            <p className="mb-3">By submitting business information, claims, prices, media, or any other content to Vigmis, you confirm that all of it is accurate, lawful, and either owned by you or used with proper authorization. Vigmis is an advertising-automation tool — it is not the source of business truth.</p>
            <p>Vigmis automatically labels AI-generated content with the disclosures required by Meta, Google, TikTok, and the EU AI Act. You may not strip these disclosures from creatives.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Platform policy compliance</h2>
            <p>All campaigns managed by Vigmis must comply with the advertising policies of Google Ads, Meta Ads, and TikTok Ads. It is your responsibility to ensure your business, products, and creatives are eligible to advertise on each platform. Vigmis is not liable for campaign disapprovals or account bans caused by policy violations.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Account security</h2>
            <ul className="list-disc list-inside space-y-1.5 text-sm">
              <li>Do not share your account credentials with unauthorized parties</li>
              <li>Do not attempt to access another user's account or data</li>
              <li>Do not reverse-engineer, scrape, or probe the Vigmis API beyond normal use</li>
              <li>Do not attempt to bypass policy gates, classifier suggestions, or human review queues</li>
              <li>Report security vulnerabilities to <a href="mailto:security@vigmis.com" className="text-indigo-600 hover:underline">security@vigmis.com</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Fair use</h2>
            <p>Vigmis reserves the right to throttle or limit accounts that place an unreasonable load on our systems. Automated bulk API requests beyond normal usage patterns are prohibited.</p>
          </section>

          <section className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3">Vigmis's sole discretion to refuse</h2>
            <p className="mb-3">Vigmis serves businesses that operate cleanly. We reserve the right to refuse service, suspend service, or remove content at our sole discretion — including in cases that fall outside the explicit tiers above. Reasons include reputational risk to Vigmis or to other customers, risk to our relationships with Meta/Google/TikTok, ethical concerns, repeated bypass attempts, or patterns of misleading content.</p>
            <p>Service refusal under this clause does not entitle you to a refund. See <Link href="/terms" className="text-indigo-600 hover:underline font-semibold">Terms of Service §9.A</Link> for full details.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Enforcement</h2>
            <p>We may suspend or terminate accounts that violate this policy, with or without notice depending on the severity of the violation. Serious violations (illegal content, fraud, defamation) will be reported to relevant authorities. Decisions may be appealed by contacting <a href="mailto:legal@vigmis.com" className="text-indigo-600 hover:underline">legal@vigmis.com</a>, but the appeal mechanism does not obligate Vigmis to reinstate service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Updates to this policy</h2>
            <p>Vigmis may update this Acceptable Use Policy at any time as platform policies, regulations, and risk landscape evolve. Material changes will be communicated by email or in-app notice. Continued use of the Service constitutes acceptance of the updated policy.</p>
          </section>

        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
