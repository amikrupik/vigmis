import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Acceptable Use Policy — Vigmis" };

export default function AcceptableUsePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
        <Link href="/"><Image src="/logo.png" alt="Vigmis" width={100} height={36} /></Link>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Acceptable Use Policy</h1>
        <p className="text-slate-400 text-sm mb-10">Last updated: April 18, 2026</p>

        <div className="space-y-8 text-slate-700 leading-relaxed">

          <section>
            <p>This policy defines what you may and may not do using the Vigmis platform. Violations may result in immediate account suspension without refund.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Prohibited content</h2>
            <p className="mb-3">You may not use Vigmis to advertise or promote:</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm">
              <li>Illegal products or services in the target geography</li>
              <li>Gambling, casinos, or sports betting without a valid license</li>
              <li>Adult content, pornography, or explicit material</li>
              <li>Weapons, firearms, or ammunition</li>
              <li>Tobacco, e-cigarettes, or recreational drugs</li>
              <li>Pyramid schemes, multi-level marketing, or get-rich-quick schemes</li>
              <li>Counterfeit goods or intellectual property infringement</li>
              <li>Hate speech, discrimination, or content targeting protected classes</li>
              <li>Misinformation, misleading claims, or deceptive advertising</li>
              <li>Malware, phishing, or cybersecurity threats</li>
            </ul>
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
              <li>Report security vulnerabilities to <a href="mailto:security@vigmis.com" className="text-indigo-600 hover:underline">security@vigmis.com</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Fair use</h2>
            <p>Vigmis reserves the right to throttle or limit accounts that place an unreasonable load on our systems. Automated bulk API requests beyond normal usage patterns are prohibited.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Enforcement</h2>
            <p>We may suspend or terminate accounts that violate this policy, with or without notice depending on the severity of the violation. Serious violations (illegal content, fraud) will be reported to relevant authorities. Decisions may be appealed by contacting <a href="mailto:legal@vigmis.com" className="text-indigo-600 hover:underline">legal@vigmis.com</a>.</p>
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
