import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "FAQ & Help Center — Vigmis" };

const FAQS = [
  {
    category: "Getting Started",
    items: [
      {
        q: "How do I connect my Google Ads account?",
        a: "During onboarding, click 'Connect Google Ads.' You'll be redirected to Google to authorize Vigmis. We request read and write access to manage your campaigns. Your login credentials are never stored — only a secure OAuth token.",
      },
      {
        q: "What if I don't have a Google Ads or Meta account yet?",
        a: "Vigmis can guide you through creating one. During onboarding, skip the connection step and select 'I don't have an account yet' — our AI will include account setup instructions in your strategy.",
      },
      {
        q: "How long does onboarding take?",
        a: "The AI interview takes 5–10 minutes. Website analysis and strategy generation run automatically and take about 1–2 minutes. You can launch your first campaign the same day.",
      },
    ],
  },
  {
    category: "Campaigns & Optimization",
    items: [
      {
        q: "What is Conservative / Moderate / Aggressive optimization mode?",
        a: "Conservative: Vigmis suggests changes but waits for your approval before acting. Moderate: Vigmis makes small adjustments (budget ±20%, bids) automatically. Aggressive: Vigmis optimizes freely within your budget. You can change this anytime in Settings.",
      },
      {
        q: "Can I pause all campaigns at once?",
        a: "Yes — use the Emergency Stop button on the Overview tab. This pauses all active campaigns across all platforms immediately. You can resume them individually or all at once from the Campaigns tab.",
      },
      {
        q: "What does 'Simulated data' mean on the Analytics tab?",
        a: "Until Google Ads Standard Access and Meta Business Verification are approved, we show simulated analytics to demonstrate the dashboard. Real data will appear automatically once platform API access is active.",
      },
      {
        q: "How does the AI decide what to optimize?",
        a: "Vigmis analyzes CTR, CPC, ROAS, conversion rate, and creative fatigue signals daily. It compares your metrics against industry benchmarks for your geography and goal type, then applies rules from the optimization engine.",
      },
    ],
  },
  {
    category: "Billing",
    items: [
      {
        q: "How does Vigmis charge me?",
        a: "Vigmis charges a management fee (5–7% of managed spend) billed monthly via Stripe. Ad spend itself goes directly from your payment method to Google/Meta/TikTok — Vigmis never touches that money.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Cancel from the Billing page → Manage Subscription. You keep access until the end of the billing period. Your data is retained for 30 days after cancellation, giving you time to export it.",
      },
      {
        q: "Do you offer refunds?",
        a: "Management fees are generally non-refundable once the billing period starts. We review exceptions case-by-case (billing errors, service outages). See our Refund Policy for details.",
      },
    ],
  },
  {
    category: "Privacy & Data",
    items: [
      {
        q: "What data does Vigmis store about me?",
        a: "We store your business profile (website, goal, budget), ad platform OAuth tokens (encrypted), campaign performance data, and alert settings. We do not store your ad creative assets — those remain on the platforms.",
      },
      {
        q: "How do I delete my account?",
        a: "Go to Settings → Danger Zone → Delete Account. All your data is permanently deleted within 30 days. This action is irreversible.",
      },
      {
        q: "Can I export my data?",
        a: "Yes. Settings → Export Data downloads a JSON file with your campaign history, settings, and optimization log.",
      },
      {
        q: "How are my ad platform tokens secured?",
        a: "OAuth tokens are encrypted using AES-256 before storage in our database. They are never logged or transmitted in plain text.",
      },
    ],
  },
  {
    category: "Support",
    items: [
      {
        q: "How do I get help?",
        a: "Use the AI assistant inside your dashboard (bottom-right chat icon) for instant help. For billing issues, email billing@vigmis.com. For bugs, email bugs@vigmis.com. Complex cases are escalated to a human and answered within 1–2 business days.",
      },
      {
        q: "What are your support hours?",
        a: "The AI assistant is available 24/7. Human support responds within 2 business days (Sunday–Thursday).",
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
        <Link href="/"><Image src="/logo_nav.png" alt="Vigmis" width={162} height={36} /></Link>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm text-slate-600 hover:text-slate-900 font-semibold">Sign in</Link>
          <Link href="/sign-up" className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">Get started →</Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Help Center</h1>
        <p className="text-slate-500 mb-12">Find answers to common questions. Can't find what you need? <Link href="/contact" className="text-indigo-600 hover:underline">Contact us →</Link></p>

        <div className="space-y-12">
          {FAQS.map((section) => (
            <div key={section.category}>
              <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">{section.category}</h2>
              <div className="space-y-4">
                {section.items.map((item) => (
                  <div key={item.q} className="bg-slate-50 rounded-xl p-5">
                    <p className="font-semibold text-slate-900 mb-2 text-sm">{item.q}</p>
                    <p className="text-slate-600 text-sm leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 bg-indigo-50 border border-indigo-100 rounded-2xl p-8 text-center">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Still have questions?</h3>
          <p className="text-slate-500 text-sm mb-4">Our team responds within 2 business days.</p>
          <Link href="/contact" className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm">
            Contact Support →
          </Link>
        </div>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">Home</Link>
          <Link href="/faq" className="hover:text-slate-600">FAQ</Link>
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
