import Link from "next/link";
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export const metadata = { title: "Cookie Policy — Vigmis" };

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Cookie Policy</h1>
        <p className="text-slate-400 text-sm mb-10">Last updated: April 18, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">What are cookies?</h2>
            <p>Cookies are small text files stored on your device when you visit a website. We use cookies to keep you signed in, remember your preferences, and understand how you use Vigmis so we can improve it.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Cookies we use</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Cookie</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Purpose</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-700">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">__clerk_*</td>
                    <td className="px-4 py-3">Authentication session</td>
                    <td className="px-4 py-3"><span className="bg-red-50 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">Essential</span></td>
                    <td className="px-4 py-3">Session</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">vigmis_cookie_consent</td>
                    <td className="px-4 py-3">Remember your cookie choice</td>
                    <td className="px-4 py-3"><span className="bg-red-50 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">Essential</span></td>
                    <td className="px-4 py-3">1 year</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono text-xs">_vercel_*</td>
                    <td className="px-4 py-3">Performance & CDN routing</td>
                    <td className="px-4 py-3"><span className="bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">Functional</span></td>
                    <td className="px-4 py-3">Session</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Essential cookies</h2>
            <p>Essential cookies are strictly necessary for Vigmis to work. They manage your login session and security. You cannot opt out of these — the service will not function without them.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Analytics cookies</h2>
            <p>If you accept analytics cookies, we collect aggregated usage data (pages visited, features used, error rates) to improve the product. We do not sell this data or use it for advertising.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Third-party cookies</h2>
            <p>We use Clerk for authentication. Clerk may set its own cookies governed by <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Clerk's Privacy Policy</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Managing your preferences</h2>
            <p>You can change your cookie preferences at any time using the banner at the bottom of any page, or by clearing your browser's local storage. You can also configure your browser to block all cookies, though this may break authentication.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">Contact</h2>
            <p>Questions about cookies? Email us at <a href="mailto:privacy@vigmis.com" className="text-indigo-600 hover:underline">privacy@vigmis.com</a>.</p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
