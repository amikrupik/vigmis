import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export const metadata: Metadata = {
  title: 'Pricing — Vigmis',
  description: 'Simple, performance-based pricing. Pay a percentage of what you spend on ads — nothing more.',
};

const CHECK = (
  <svg className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const DASH = (
  <svg className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
  </svg>
);

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <PublicNav />

      <main className="flex-1">

        {/* Hero */}
        <section className="text-center px-6 pt-16 pb-10 max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 tracking-widest uppercase mb-3">Pricing</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
            Pay for results,<br className="hidden sm:block" /> not for software
          </h1>
          <p className="mt-4 text-lg text-slate-500 max-w-xl mx-auto">
            Vigmis charges a small percentage of your ad spend — no large upfront fees.
            The more your campaigns grow, the more we earn together.
          </p>
        </section>

        {/* Plan cards */}
        <section className="px-6 pb-12 max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6 md:items-stretch">

            {/* Grow */}
            <div className="relative rounded-2xl border-2 border-slate-200 bg-white p-8 flex flex-col">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900">Grow</h2>
                <p className="text-sm text-slate-400 mt-1">For businesses starting with paid ads</p>
              </div>

              <div className="mb-2">
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-extrabold text-slate-900">7%</span>
                  <span className="text-slate-400 text-sm mb-2">of ad spend / month</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">No monthly subscription · $29 minimum charge</p>
              </div>

              <p className="text-sm font-semibold text-slate-700 mb-1 mt-5">Starts at <span className="text-slate-900">$29 / month</span></p>
              <p className="text-xs text-slate-400 mb-6">Minimum applies when ad spend is low</p>

              <ul className="space-y-3 text-sm text-slate-700 flex-1 mb-8">
                <li className="flex items-start gap-2">{CHECK}<span>Google, Meta & TikTok management</span></li>
                <li className="flex items-start gap-2">{CHECK}<span><strong>100 AI reply drafts</strong> included / month</span></li>
                <li className="flex items-start gap-2">{CHECK}<span>AI optimization <strong>3× / day</strong></span></li>
                <li className="flex items-start gap-2">{CHECK}<span><strong>Weekly</strong> performance briefing (WhatsApp / email)</span></li>
                <li className="flex items-start gap-2">{CHECK}<span>AI social posts — caption + image + publish</span></li>
                <li className="flex items-start gap-2">{CHECK}<span>Analytics & reporting dashboard</span></li>
                <li className="flex items-start gap-2">{CHECK}<span>1 user</span></li>
              </ul>

              <Link
                href="/sign-up"
                className="block text-center bg-slate-900 hover:bg-slate-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                Start with Grow →
              </Link>
            </div>

            {/* Scale */}
            <div className="relative rounded-2xl border-2 border-indigo-500 bg-indigo-50 p-8 flex flex-col shadow-xl shadow-indigo-100">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="bg-indigo-600 text-white text-xs font-bold px-4 py-1.5 rounded-full tracking-wide">MOST POPULAR</span>
              </div>

              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900">Scale</h2>
                <p className="text-sm text-slate-500 mt-1">For businesses serious about growth</p>
              </div>

              <div className="mb-2">
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-extrabold text-slate-900">6%</span>
                  <span className="text-slate-500 text-sm mb-2">of ad spend / month</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">+ $29 monthly subscription · $29 minimum commission</p>
              </div>

              <p className="text-sm font-semibold text-slate-700 mb-1 mt-5">
                Starts at <span className="text-slate-900">$58 / month</span>
                <span className="text-xs font-normal text-slate-400 ml-2">($29 sub + $29 min commission)</span>
              </p>
              <p className="text-xs text-slate-400 mb-6">Scale beats Grow in total cost once ad spend exceeds ~$500 / month</p>

              <ul className="space-y-3 text-sm text-slate-700 flex-1 mb-8">
                <li className="flex items-start gap-2">{CHECK}<span>Everything in Grow</span></li>
                <li className="flex items-start gap-2">{CHECK}<span><strong>5 social posts</strong> included / month (caption + image + publish)</span></li>
                <li className="flex items-start gap-2">{CHECK}<span><strong>300 AI reply drafts</strong> included / month</span></li>
                <li className="flex items-start gap-2">{CHECK}<span>AI optimization <strong>6× / day</strong></span></li>
                <li className="flex items-start gap-2">{CHECK}<span><strong>Daily</strong> performance briefing (WhatsApp / email)</span></li>
                <li className="flex items-start gap-2">{CHECK}<span><strong>1 video</strong> + <strong>3 image creatives</strong> included / month</span></li>
                <li className="flex items-start gap-2">{CHECK}<span><strong>Up to 3 users</strong> per workspace</span></li>
              </ul>

              <Link
                href="/sign-up"
                className="block text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-indigo-200"
              >
                Start with Scale →
              </Link>
            </div>
          </div>
        </section>

        {/* Full comparison */}
        <section className="px-6 pb-16 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Full plan comparison</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-4 font-semibold text-slate-600 w-1/2">Feature</th>
                  <th className="text-center px-6 py-4 font-semibold text-slate-900">Grow</th>
                  <th className="text-center px-6 py-4 font-semibold text-indigo-700">Scale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-slate-50/50">
                  <td colSpan={3} className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Pricing</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">Management fee</td>
                  <td className="px-6 py-3 text-center font-medium">7% of ad spend</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">6% of ad spend</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">Monthly subscription</td>
                  <td className="px-6 py-3 text-center text-slate-400">None</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">$29</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">Minimum monthly charge</td>
                  <td className="px-6 py-3 text-center">$29</td>
                  <td className="px-6 py-3 text-center text-indigo-700">$58 ($29 + $29)</td>
                </tr>

                <tr className="bg-slate-50/50">
                  <td colSpan={3} className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Campaigns & Optimization</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">Platforms managed</td>
                  <td className="px-6 py-3 text-center">Google, Meta, TikTok</td>
                  <td className="px-6 py-3 text-center text-indigo-700">Google, Meta, TikTok</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">Optimization runs</td>
                  <td className="px-6 py-3 text-center">3× / day</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">6× / day</td>
                </tr>

                <tr className="bg-slate-50/50">
                  <td colSpan={3} className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">AI Assistant & Inbox</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">AI Strategy Sessions / month</td>
                  <td className="px-6 py-3 text-center">By ad spend level</td>
                  <td className="px-6 py-3 text-center text-indigo-700">By ad spend level</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">AI reply drafts included / month</td>
                  <td className="px-6 py-3 text-center">100</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">300</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">Performance briefing</td>
                  <td className="px-6 py-3 text-center">Weekly</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">Daily</td>
                </tr>

                <tr className="bg-slate-50/50">
                  <td colSpan={3} className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Content & Creatives</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">
                    Social posts included / month
                    <p className="text-xs text-slate-400 mt-0.5">AI caption + publish. Includes new image ($1) or your own creative ($0.70)</p>
                  </td>
                  <td className="px-6 py-3 text-center text-slate-400">Pay per use</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">5 included</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">
                    Videos included / month
                    <p className="text-xs text-slate-400 mt-0.5">Any type — animation, cinematic, or avatar. Publishing to FB / IG / TikTok included.</p>
                  </td>
                  <td className="px-6 py-3 text-center">{DASH}</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">1 (any type)</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">
                    Image Creatives included / month
                    <p className="text-xs text-slate-400 mt-0.5">Standalone ad images, not tied to a post</p>
                  </td>
                  <td className="px-6 py-3 text-center">{DASH}</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">3</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-slate-700">Users per workspace</td>
                  <td className="px-6 py-3 text-center">1</td>
                  <td className="px-6 py-3 text-center font-medium text-indigo-700">Up to 3</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Add-ons */}
        <section className="px-6 pb-16 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">Additional usage</h2>
          <p className="text-center text-sm text-slate-400 mb-8">Pay only for what you use — charged automatically at month end</p>

          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { label: 'Social post — with new AI image', desc: 'AI writes caption + generates image + publishes to FB or IG', price: '$1.00' },
              { label: 'Social post — with your own creative', desc: 'AI writes caption + publishes your uploaded or previously used image', price: '$0.70' },
              { label: 'AI reply draft (after bundle)', desc: 'After your free monthly bundle (100 on Grow, 300 on Scale)', price: '$0.05' },
              { label: 'Extra 25 AI Strategy Sessions', desc: 'Add more advisor sessions when your monthly quota runs out', price: '$9.00' },
              { label: 'Image Creative', desc: 'Standalone AI image for paid ads — not tied to any post', price: '$5.00' },
              { label: 'Animation video', desc: 'Publish to FB, IG, or TikTok — included in price', price: '$8.00' },
              { label: 'Cinematic video', desc: 'Publish to FB, IG, or TikTok — included in price', price: '$12.00' },
              { label: 'Avatar video (AI spokesperson)', desc: 'Publish to FB, IG, or TikTok — included in price', price: '$15.00' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between bg-slate-50 rounded-xl px-5 py-4 border border-slate-100">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
                <span className="text-slate-900 font-bold text-sm ml-4 flex-shrink-0">{item.price}</span>
              </div>
            ))}
          </div>
        </section>

        {/* AI quota by spend */}
        <section className="px-6 pb-16 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">AI Strategy Sessions scale with your budget</h2>
          <p className="text-center text-sm text-slate-400 mb-8">
            The more you advertise, the more AI advisor access you get — automatically, no upgrades needed.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">Monthly ad spend</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">AI Strategy Sessions</th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">AI reply drafts / month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr><td className="px-5 py-3 text-slate-700">Up to $1,000</td><td className="px-5 py-3 text-center">30</td><td className="px-5 py-3 text-center text-slate-400">per plan</td></tr>
                <tr><td className="px-5 py-3 text-slate-700">$1,001 – $3,000</td><td className="px-5 py-3 text-center">75</td><td className="px-5 py-3 text-center text-slate-400">per plan</td></tr>
                <tr><td className="px-5 py-3 text-slate-700">$3,001 – $6,000</td><td className="px-5 py-3 text-center">150</td><td className="px-5 py-3 text-center text-slate-400">per plan</td></tr>
                <tr><td className="px-5 py-3 text-slate-700">$6,001 – $12,000</td><td className="px-5 py-3 text-center">300</td><td className="px-5 py-3 text-center text-slate-400">per plan</td></tr>
                <tr><td className="px-5 py-3 text-slate-700">$12,000+</td><td className="px-5 py-3 text-center">400+</td><td className="px-5 py-3 text-center text-slate-400">per plan</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 text-center mt-3">Quotas reset on the 1st of each month. Unused quota does not roll over.</p>
        </section>

        {/* Full billing disclosure */}
        <section className="px-6 pb-16 max-w-4xl mx-auto">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-1">Complete billing disclosure</h2>
            <p className="text-sm text-slate-500 mb-6">We believe in full transparency. Here is exactly how you will be charged — no surprises.</p>

            <div className="space-y-5 text-sm text-slate-700">

              <div>
                <p className="font-semibold text-slate-900 mb-1">Management fee</p>
                <p>Vigmis charges a percentage of your total monthly ad spend across all connected platforms (Google Ads, Meta Ads, TikTok Ads). The percentage is 7% on Grow and 6% on Scale. This is calculated on the spend you place with the platforms — Vigmis never handles or passes through your ad budget.</p>
              </div>

              <div>
                <p className="font-semibold text-slate-900 mb-1">Minimum charge</p>
                <p>If your management fee for the month is below the minimum ($29), you are charged the minimum instead. On Scale, the $29 subscription is always charged separately — so the minimum total on Scale is $58/month even with zero ad spend.</p>
              </div>

              <div>
                <p className="font-semibold text-slate-900 mb-1">Add-on usage</p>
                <p>Social posts, AI reply drafts above your bundle, image creatives, and videos are charged per use at the rates listed above. These are tallied throughout the month and added to your monthly invoice. You can see a running total in your billing dashboard at any time.</p>
              </div>

              <div>
                <p className="font-semibold text-slate-900 mb-1">AI fair use — activity reduction</p>
                <p>Vigmis uses AI to power your campaigns. To ensure all customers receive consistent service, each account has a monthly AI budget proportional to the management fee paid. If your account's AI usage reaches 25% of your fee, Vigmis automatically switches routine tasks (comment triage, sentiment analysis) to a lighter AI model and pauses non-essential background jobs. If usage reaches 40% of your fee, AI-powered features are paused for the remainder of the month and resume on the 1st. You will receive a notification before any reduction takes effect. Normal usage patterns never trigger this — it is a safeguard against extreme edge cases only.</p>
              </div>

              <div>
                <p className="font-semibold text-slate-900 mb-1">AI Strategy Sessions quota</p>
                <p>Each plan includes a monthly quota of AI advisor conversations (see table above). When your quota is reached, you receive a soft notification — no features break. You can purchase additional sessions in packs of 25 for $9, or wait for the quota to reset on the 1st of the next month.</p>
              </div>

              <div>
                <p className="font-semibold text-slate-900 mb-1">Billing cycle and invoices</p>
                <p>Billing runs on a calendar month cycle. Your invoice is generated on the 1st of each month for the previous month's usage. Payment is processed automatically. You can view all past invoices in your billing dashboard.</p>
              </div>

              <div>
                <p className="font-semibold text-slate-900 mb-1">Cancellation</p>
                <p>You may cancel at any time from your billing settings. Cancellation takes effect at the end of the current billing month. You will not be charged for the following month. Any usage already accrued in the current month is billed normally on the next invoice date.</p>
              </div>

            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="px-6 pb-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Common questions</h2>
          <div className="space-y-6">
            {[
              {
                q: 'What counts as "managed ad spend"?',
                a: 'The total budget running through your connected Google, Meta, and TikTok ad accounts while managed by Vigmis. We never take a cut of your revenue — only a small percentage of what you put into ads.',
              },
              {
                q: 'What is a Performance Briefing?',
                a: 'A WhatsApp or email summary sent by Vigmis with your key numbers — what you spent, what your ROAS was, what the AI changed and why. Grow gets one per week; Scale gets one every day.',
              },
              {
                q: 'What is an AI Strategy Session?',
                a: 'A conversation with the Vigmis AI advisor — ask it to analyze a campaign, explain a decision, suggest a creative direction, or review your strategy. Each session is a continuous conversation of up to 12 messages.',
              },
              {
                q: 'What is an AI reply draft?',
                a: 'When a customer comments on your Facebook or Instagram post, Vigmis drafts a reply for you. Your included bundle (100 on Grow, 300 on Scale) covers this — additional drafts are $0.05 each.',
              },
              {
                q: 'What is an Image Creative?',
                a: 'A standalone AI-generated image designed for paid ad campaigns — not tied to a post. Scale includes 3 per month. Additional creatives are $5 each.',
              },
              {
                q: 'Can I reuse a video or image I already paid for?',
                a: 'Yes. Every creative you produce or upload is stored in your library. Publishing a post using a previously created or uploaded image costs $0.70 (caption writing + publishing only — no new image generation). Videos you purchase can be published to any platform (FB, IG, TikTok) at no extra cost, and republished as many times as you like.',
              },
              {
                q: 'If I buy a video, can I publish it on TikTok, Instagram, and Facebook?',
                a: 'Yes. Publishing is included in the video price regardless of platform. One video purchase — publish wherever you want.',
              },
              {
                q: 'Is there a contract or minimum commitment?',
                a: 'No. Both plans are month-to-month. Cancel anytime from your billing settings — no questions asked.',
              },
              {
                q: 'When will I be charged more than the minimum?',
                a: 'On Grow: once your ad spend exceeds $414/month (7% of $414 = $29). On Scale: your commission exceeds $29 once ad spend passes $483/month — but the $29 subscription is always charged on top.',
              },
            ].map(item => (
              <div key={item.q} className="border-b border-slate-100 pb-6">
                <p className="font-semibold text-slate-900 mb-2">{item.q}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-indigo-600 px-6 py-16 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-3">Ready to put your ads on autopilot?</h2>
          <p className="text-indigo-200 mb-8 max-w-md mx-auto">Connect your ad accounts, set your budget, and let Vigmis do the rest.</p>
          <Link
            href="/sign-up"
            className="inline-block bg-white text-indigo-700 font-bold px-8 py-3.5 rounded-xl hover:bg-indigo-50 transition-colors shadow-lg"
          >
            Get started today →
          </Link>
          <p className="text-xs text-indigo-300 mt-4">Cancel anytime · No long-term commitment</p>
        </section>

      </main>

      <PublicFooter />
    </div>
  );
}
