import Link from "next/link";
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

export const metadata = { title: "Terms of Service — Vigmis" };

const LAST_UPDATED = "June 8, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-black text-slate-900 mb-2">Terms of Service</h1>
        <p className="text-slate-400 text-sm mb-12">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-10 text-slate-600 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">1. Agreement to Terms</h2>
            <p className="mb-3">By creating an account, accessing, or using the Vigmis platform ("Service"), you confirm that you have read, understood, and agree to be legally bound by these Terms of Service and all documents incorporated by reference, including our Privacy Policy and Acceptable Use Policy. If you do not agree in full, you must not use the Service.</p>
            <p>These terms constitute a binding legal agreement between you ("User", "you", "your") and <strong>Taurus Management and Investments Ltd.</strong> (טאורוס ניהול והשקעות בע"מ), Company No. 514565118, registered in Israel, with offices at 25 Mabshovitz Binyamin St., Herzliya, 4640525, Israel — operating the Vigmis product ("Vigmis", "we", "us", "our"). Legal notices: <a href="mailto:legal@vigmis.com" className="text-indigo-600 hover:underline">legal@vigmis.com</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">2. Service Description</h2>
            <p>Vigmis provides an AI-powered advertising management platform that automates the creation, management, and optimisation of digital advertising campaigns on Google Ads, Meta Ads, and TikTok Ads. The Service includes campaign strategy generation, creative production, analytics, performance optimisation, and social media management. The Service operates as an automated software system and is provided on an "as is" basis.</p>
          </section>

          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3">3. AUTOMATED AI SYSTEM — CRITICAL DISCLAIMER</h2>
            <p className="mb-3 font-semibold text-slate-800">VIGMIS IS AN AUTOMATED ARTIFICIAL INTELLIGENCE SYSTEM. BY USING THE SERVICE, YOU EXPRESSLY ACKNOWLEDGE AND ACCEPT THE FOLLOWING:</p>
            <ul className="list-disc list-inside space-y-2 mb-3">
              <li><strong>Vigmis is a robot.</strong> All campaign decisions, budget changes, pauses, resumes, and optimisations are made autonomously by AI algorithms. Human review by Vigmis staff does not occur in real time.</li>
              <li><strong>AI systems contain errors.</strong> The Service may at any time contain software bugs, algorithmic errors, incorrect data interpretations, failed API calls, system outages, connectivity failures, or other technical malfunctions — any of which may cause campaigns to underperform, overspend, underspend, stop running, or behave unexpectedly.</li>
              <li><strong>Vigmis dashboard data is not authoritative.</strong> Data shown in the Vigmis dashboard is fetched from third-party platforms (Google, Meta, TikTok) and may be delayed, incomplete, or inaccurate. The Vigmis dashboard is not a substitute for direct monitoring within each ad platform's own interface.</li>
              <li><strong>You are solely responsible for monitoring your campaigns.</strong> It is your obligation, at your own initiative and at a frequency you deem appropriate, to log in directly to Google Ads, Meta Ads Manager, and TikTok Ads Manager to verify that your campaigns are active, spending within expected ranges, and producing results. You must not rely exclusively on Vigmis notifications, alerts, or dashboard data.</li>
              <li><strong>Immediate action is your responsibility.</strong> If you discover that your campaigns are not running, are overspending, or are producing unexpected results, you must take immediate corrective action directly within the ad platform. Vigmis is not responsible for any delay in response.</li>
              <li><strong>You may pause or stop the Service at any time</strong> from the Vigmis dashboard. If you suspect a malfunction, pause all campaigns immediately and contact <a href="mailto:support@vigmis.com" className="text-indigo-600 hover:underline">support@vigmis.com</a>.</li>
            </ul>
            <p className="font-semibold text-slate-800">VIGMIS ACCEPTS NO LIABILITY WHATSOEVER FOR ANY LOSS, DAMAGE, LOST REVENUE, LOST SALES, MISSED OPPORTUNITIES, OR ANY OTHER HARM ARISING FROM CAMPAIGNS THAT WERE NOT RUNNING, RUNNING INCORRECTLY, OR NOT DELIVERING EXPECTED RESULTS — REGARDLESS OF THE CAUSE, INCLUDING BUT NOT LIMITED TO SOFTWARE BUGS, SYSTEM ERRORS, API FAILURES, OR ALGORITHMIC ERRORS.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">4. Account Responsibilities</h2>
            <p className="mb-3">You are responsible for:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Maintaining the security and confidentiality of your account credentials</li>
              <li>All activity that occurs under your account, whether authorised by you or not</li>
              <li>Ensuring you have full legal authority to connect the ad accounts you link to Vigmis</li>
              <li>Compliance with the advertising policies of Google, Meta, and TikTok at all times</li>
              <li>Ensuring all advertising content complies with applicable laws in all jurisdictions where ads are served</li>
              <li>Independently monitoring your campaigns on each ad platform at regular intervals</li>
              <li>Having adequate backup advertising processes in place in the event of Service malfunction</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">5. Ad Spend & Billing</h2>
            <p className="mb-3"><strong>Ad spend:</strong> You pay Google, Meta, and TikTok directly via your own billing accounts. Vigmis does not control, access, or process payments to ad platforms. Vigmis has no ability to stop or retrieve ad spend once committed to a platform.</p>
            <p className="mb-3"><strong>Vigmis fee — Grow plan:</strong> A management fee of 7% of total ad spend managed by Vigmis in that billing month, subject to a minimum of $29/month. This fee is calculated and invoiced at the end of each calendar month based on actual spend data received from ad platforms.</p>
            <p className="mb-3"><strong>Vigmis fee — Scale plan:</strong> A flat subscription fee of $49/month plus 6% of total ad spend managed by Vigmis in that billing month. The subscription fee is charged at the start of each billing period via Stripe.</p>
            <p className="mb-3"><strong>Billing obligation on cancellation:</strong> You remain obligated to pay all fees accrued up to and including the date of account cancellation or deletion. For Grow plan users, this means the management fee on all ad spend that occurred during the current calendar month up to the cancellation date, regardless of whether the monthly invoice has yet been generated. For Scale plan users, the subscription fee already collected for the current billing period is non-refundable and access continues through the end of that period.</p>
            <p className="mb-3"><strong>Fee accuracy:</strong> Management fees are calculated based on data received from ad platforms. We cannot guarantee the accuracy of spend data provided by third-party platforms. If you dispute a fee, contact <a href="mailto:billing@vigmis.com" className="text-indigo-600 hover:underline">billing@vigmis.com</a> within 30 days of the invoice date.</p>
            <p><strong>Refunds:</strong> Service fees are non-refundable except where required by applicable law or as stated in our <Link href="/refund" className="text-indigo-600 hover:underline">Refund & Cancellation Policy</Link>. Ad spend refunds must be requested directly from the respective ad platform. Vigmis has no ability to issue ad spend refunds on your behalf.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">6. AI-Generated Content & Customer Content Responsibility</h2>
            <p className="mb-3"><strong>You are the publisher.</strong> Vigmis is an advertising-automation tool that prepares draft content based on the business information you provide. You are the source of business truth and the publisher of every ad, post, image, video, and message that goes out under your name. Vigmis is not the legal author of any content published through the Service.</p>
            <p className="mb-3"><strong>Your warranty to us.</strong> By submitting business information, creative assets, or approving content for publication, you represent and warrant that:</p>
            <ul className="list-disc list-inside space-y-2 mb-3">
              <li>All information, claims, prices, promises, guarantees, and business representations you provide are accurate, lawful, and not misleading</li>
              <li>You own, or have written permission to use, every image, video, logo, brand mark, music track, and piece of copy you submit</li>
              <li>You hold the professional licenses required to advertise services in your industry (medical, financial, legal, gambling, alcohol, cannabis, or other regulated categories) and the licenses are valid in every jurisdiction where your ads will run</li>
              <li>You will keep this information current and re-attest periodically when prompted</li>
            </ul>
            <p className="mb-3"><strong>AI disclosure consent.</strong> You authorize Vigmis to label AI-generated content with platform-required disclosures, including Meta AI Info labels, TikTok AI-content labels, Google Ads synthetic-content notices, and EU AI Act Article 50 deployer notices. You understand omitting these labels is a violation of platform terms and applicable law.</p>
            <p className="mb-3"><strong>You acknowledge:</strong></p>
            <ul className="list-disc list-inside space-y-2">
              <li>AI-generated content may contain errors, inaccuracies, offensive material, or legally problematic content</li>
              <li>You are solely responsible for reviewing all AI-generated content before publication</li>
              <li>Vigmis makes no warranty regarding the suitability, accuracy, or legality of AI-generated content</li>
              <li>You indemnify Vigmis for any claim arising from AI-generated content published under your account</li>
              <li>Vigmis does not guarantee specific campaign results, ROAS, conversion rates, or any performance metric</li>
              <li>You retain ownership of your campaign data; Vigmis retains the right to use anonymised, aggregated data to improve the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">7. Third-Party Platform Disclaimer</h2>
            <p className="mb-3">Vigmis integrates with third-party advertising platforms (Google Ads, Meta Ads, TikTok Ads) and other services. You acknowledge that:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Vigmis has no control over the availability, uptime, or functionality of Google, Meta, or TikTok platforms</li>
              <li>Vigmis is not responsible for any service outage, API failure, rate limiting, or policy change by any third-party platform</li>
              <li>Ad platform policies may change at any time, which may affect campaign delivery or account standing — Vigmis bears no responsibility for such changes</li>
              <li>Account suspension or policy violations imposed by ad platforms are your responsibility to resolve directly with the platform</li>
              <li>Data provided by ad platforms to Vigmis (including performance metrics, spend data, and conversion data) may be delayed, incomplete, or inaccurate — Vigmis is not responsible for platform-side data errors</li>
              <li>Vigmis does not guarantee uninterrupted API connectivity with any third-party platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">8. No Guarantee of Results</h2>
            <p className="mb-3">Digital advertising performance is influenced by numerous factors entirely outside Vigmis's control, including but not limited to: market competition, seasonal demand, algorithm changes by ad platforms, landing page quality, product-market fit, pricing, user behaviour, economic conditions, and creative effectiveness.</p>
            <p className="mb-3">Vigmis uses AI and data-driven methods to maximise the likelihood of strong campaign performance. However, <strong>we make absolutely no guarantee of any specific results</strong>, including:</p>
            <ul className="list-disc list-inside space-y-2 mb-3">
              <li>Return on Ad Spend (ROAS) or Return on Investment (ROI)</li>
              <li>Cost per Lead (CPL), Cost per Acquisition (CPA), or cost per any other metric</li>
              <li>Revenue, sales volume, conversion rates, or profitability</li>
              <li>Impression volumes, click-through rates, or audience reach</li>
              <li>Campaign approval by ad platforms</li>
              <li>Any specific business outcome whatsoever</li>
            </ul>
            <p>Any performance projections, forecasts, or estimates provided by Vigmis are illustrative only and do not constitute guarantees or representations of future results.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">9. Prohibited Uses</h2>
            <p className="mb-3">You may not use Vigmis to advertise or promote any of the categories listed in our <Link href="/acceptable-use" className="text-indigo-600 hover:underline font-semibold">Acceptable Use Policy</Link>, which is incorporated by reference into these Terms. The AUP defines three tiers of restriction: Tier 0 (hard-blocked), Tier 1 (requires license and human review), and Tier 2 (permitted with caveats).</p>
            <p>In summary, you may not use Vigmis to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Advertise illegal products, services, or activities in any jurisdiction</li>
              <li>Run misleading, deceptive, fraudulent, or defamatory advertising — including ads that name competitor businesses or individuals in a negative light</li>
              <li>Make absolute medical claims (e.g. "cures cancer", "100% effective")</li>
              <li>Make guaranteed financial-return claims or operate pyramid/MLM-style schemes</li>
              <li>Market alcohol, tobacco, gambling, or cannabis to minors or in jurisdictions where such marketing is unlawful</li>
              <li>Violate the advertising policies or terms of service of Google, Meta, or TikTok</li>
              <li>Infringe third-party intellectual property, trademark, or copyright rights</li>
              <li>Circumvent platform spending limits, policies, or safety systems</li>
              <li>Promote hate speech, incitement to violence, or content targeting protected groups</li>
              <li>Engage in any activity that exposes Vigmis to legal, reputational, or platform-relationship risk</li>
            </ul>
          </section>

          <section className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3">9.A Vigmis's Sole Discretion to Refuse or Terminate Service</h2>
            <p className="mb-3 font-semibold text-slate-800">VIGMIS RESERVES THE RIGHT TO REFUSE SERVICE, SUSPEND SERVICE, OR REMOVE CONTENT AT ITS SOLE DISCRETION — INCLUDING IN CASES THAT FALL OUTSIDE THE EXPLICITLY PROHIBITED CATEGORIES LISTED ABOVE.</p>
            <p className="mb-3">Reasons for which Vigmis may refuse or terminate service include, but are not limited to:</p>
            <ul className="list-disc list-inside space-y-2 mb-3">
              <li>Reputational risk to Vigmis or to other customers using the platform</li>
              <li>Risk to Vigmis's relationship with Meta, Google, TikTok, or any other ad platform — including any conduct that could lead to App Review revocation or platform-level sanctions</li>
              <li>Ethical concerns about a business model, even where legally permitted</li>
              <li>Repeated attempts to bypass policy gates, suggested rewrites, or human review</li>
              <li>Patterns of misleading content, customer complaints, or chargeback activity</li>
              <li>Inability or refusal to provide required eligibility attestations or professional license proof</li>
            </ul>
            <p className="mb-3">Service refusal or termination under this section does not entitle you to a refund. We will provide the reason in writing upon request, but the decision is final and not subject to external arbitration.</p>
            <p className="text-sm text-slate-500"><strong>Why this clause exists:</strong> Vigmis operates on top of third-party advertising platforms whose terms apply to all of our customers simultaneously. A single customer's policy breach can result in platform-wide sanctions affecting every customer. We therefore enforce standards that may be stricter than the law itself.</p>
          </section>

          <section className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3">10. DISCLAIMER OF WARRANTIES</h2>
            <p className="mb-3 font-semibold text-slate-800">TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:</p>
            <ul className="list-disc list-inside space-y-2 mb-3">
              <li>WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT</li>
              <li>WARRANTIES THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, BUG-FREE, OR SECURE</li>
              <li>WARRANTIES REGARDING THE ACCURACY, COMPLETENESS, OR RELIABILITY OF ANY DATA, CONTENT, OR RESULTS PROVIDED BY THE SERVICE</li>
              <li>WARRANTIES THAT THE SERVICE WILL MEET YOUR REQUIREMENTS OR PRODUCE ANY PARTICULAR OUTCOME</li>
              <li>WARRANTIES THAT DEFECTS WILL BE CORRECTED WITHIN ANY PARTICULAR TIMEFRAME</li>
            </ul>
            <p>Vigmis does not warrant that the Service is free from viruses, malware, or other harmful components. You use the Service entirely at your own risk.</p>
          </section>

          <section className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-3">11. LIMITATION OF LIABILITY</h2>
            <p className="mb-3 font-semibold text-slate-800">TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, VIGMIS, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, AFFILIATES, AND LICENSORS SHALL NOT BE LIABLE TO YOU OR ANY THIRD PARTY FOR:</p>
            <ul className="list-disc list-inside space-y-2 mb-4">
              <li>ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES</li>
              <li>LOSS OF PROFITS, REVENUE, SALES, BUSINESS, DATA, OR GOODWILL</li>
              <li>LOSS OF ANTICIPATED SAVINGS OR BUSINESS OPPORTUNITIES</li>
              <li>CAMPAIGN DOWNTIME, FAILURE TO DELIVER ADS, OR UNDERPERFORMANCE OF ANY CAMPAIGN</li>
              <li>DECISIONS MADE BY THE AI SYSTEM — INCLUDING BUDGET CHANGES, PAUSING, OR CAMPAIGN MODIFICATIONS</li>
              <li>ERRORS, BUGS, INACCURACIES, OR MALFUNCTIONS IN THE SOFTWARE OR AI ALGORITHMS</li>
              <li>THIRD-PARTY PLATFORM OUTAGES, API FAILURES, OR POLICY CHANGES</li>
              <li>UNAUTHORISED ACCESS TO YOUR ACCOUNT OR DATA (INCLUDING AS A RESULT OF HACKING, PHISHING, OR CYBERATTACKS)</li>
              <li>DATA BREACHES, DATA LOSS, OR DATA CORRUPTION — WHETHER ON VIGMIS SYSTEMS OR THIRD-PARTY SERVICES</li>
              <li>SERVICE INTERRUPTION, MAINTENANCE DOWNTIME, OR FORCE MAJEURE EVENTS</li>
              <li>ANY DAMAGE ARISING FROM YOUR RELIANCE ON AI-GENERATED CONTENT, STRATEGIES, OR RECOMMENDATIONS</li>
              <li>ANY OTHER MATTER RELATING TO THE SERVICE, HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY</li>
            </ul>
            <p className="mb-3 font-semibold text-slate-800">THIS LIMITATION APPLIES REGARDLESS OF WHETHER VIGMIS HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES AND REGARDLESS OF THE FAILURE OF ANY ESSENTIAL PURPOSE OF ANY LIMITED REMEDY.</p>
            <p><strong>Maximum aggregate liability:</strong> In any event, Vigmis's total aggregate liability to you for all claims under these Terms shall not exceed the total fees you actually paid to Vigmis in the <strong>three (3) months</strong> immediately preceding the event giving rise to the claim. If you have paid no fees, Vigmis's maximum liability is USD $50.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">12. Indemnification</h2>
            <p className="mb-3">You agree to defend, indemnify, and hold harmless Vigmis, its directors, officers, employees, agents, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from or related to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Your use of the Service or violation of these Terms</li>
              <li>Your advertising content, campaigns, or creative assets</li>
              <li>Violation of any third-party rights, including intellectual property rights</li>
              <li>Violation of any applicable law or regulation</li>
              <li>Any claim by a third party arising from your advertising activities</li>
              <li>Your misuse of AI-generated content</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">13. Cybersecurity & Data Security</h2>
            <p className="mb-3">While Vigmis implements industry-standard security measures, no system is completely secure. You acknowledge that:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Vigmis cannot guarantee the absolute security of your data or account</li>
              <li>Vigmis is not responsible for unauthorised access to your account resulting from your failure to maintain credential security</li>
              <li>Vigmis is not liable for damages resulting from cyberattacks, hacking, phishing, man-in-the-middle attacks, or other malicious acts by third parties — whether targeting Vigmis systems or your own systems</li>
              <li>You must immediately notify us at <a href="mailto:security@vigmis.com" className="text-indigo-600 hover:underline">security@vigmis.com</a> if you become aware of any unauthorised access to your account</li>
              <li>You are responsible for securing your own devices, networks, and credentials</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">14. Force Majeure</h2>
            <p>Vigmis shall not be in breach of these Terms or liable for any delay or failure in performance resulting from causes beyond our reasonable control, including but not limited to: acts of God, natural disasters, pandemic or epidemic, war, terrorism, civil unrest, government action, regulatory changes, internet outages, power failures, failures of third-party infrastructure providers (including AWS, Google Cloud, Cloudflare), ad platform outages, cyberattacks on third-party systems, or any other event beyond our reasonable control. During such events, Vigmis's obligations under these Terms are suspended for the duration of the force majeure event.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">15. Creative Production Policy (Video, Image, Post)</h2>
            <p className="mb-3">The following policy applies to all AI-generated creative content produced by Vigmis, including videos (HeyGen, Kling, Pika), images (DALL-E/OpenAI), and AI-generated social posts.</p>
            <ul className="list-disc list-inside space-y-2 mb-3">
              <li><strong>You are charged only upon approval.</strong> Clicking "Approve &amp; Pay" constitutes your authorisation to charge the generation fee. You are not charged for any generation you have not approved.</li>
              <li><strong>First generation and first revision are free.</strong> One free revision is included per creative. Revision 2 and above are charged at the same rate as a new generation of that type.</li>
              <li><strong>Per-type pricing (revision 2+):</strong> Avatar video (HeyGen) — $15; Cinematic video (Replicate) — $12; Animation (Replicate) — $8; Standalone image creative — $5. Text-only social posts and post copy are not subject to revision charges.</li>
              <li><strong>Maximum 5 revisions per brief.</strong> After 5 attempts on a single brief, Vigmis may require starting from a new concept. Vigmis is not obligated to continue generating on a brief indefinitely.</li>
              <li><strong>Discard at any time before approval.</strong> If you click "Discard — no charge" before approving, you will not be charged. Any completed creative not approved within 7 days is automatically discarded at no charge.</li>
              <li><strong>Once approved, non-refundable.</strong> Third-party provider costs are incurred immediately upon generation. Approved generations are non-refundable. If generation fails after approval due to a technical error on our side, you receive a full retry credit.</li>
              <li><strong>Delivery time:</strong> Approximately 3–8 minutes for videos; seconds for images. Exact timing depends on third-party provider availability.</li>
              <li><strong>Storage:</strong> Creative assets stored for 12 months. You are responsible for downloading and backing up assets you wish to retain beyond 12 months.</li>
              <li><strong>Provider disclaimers:</strong> Vigmis is not responsible if a creative provider (HeyGen, Kling, Pika, OpenAI, or similar) is unavailable, changes pricing, modifies its service, or produces output that does not meet your expectations.</li>
              <li>You may not use generated creatives for illegal, misleading, or harmful advertising. All creatives are subject to the Acceptable Use Policy.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">16. Termination & Cancellation</h2>

            <p className="mb-4 font-semibold text-slate-800">16.1 — Two distinct exit paths</p>
            <p className="mb-3">Vigmis offers two separate ways to end your relationship with the Service, each with different effects:</p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-4 space-y-3 text-sm">
              <div>
                <p className="font-semibold text-slate-800 mb-1">Path A — Cancel subscription (Scale plan only)</p>
                <p className="text-slate-600">Access: Dashboard → Billing → Manage Subscription → Cancel via Stripe billing portal.<br />
                Effect: Your Scale subscription is cancelled and will not renew. You retain full access until the end of the current billing period, after which your plan reverts to Grow. Campaigns continue running under the Grow plan terms. No data is deleted.</p>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <p className="font-semibold text-slate-800 mb-1">Path B — Delete account (all users)</p>
                <p className="text-slate-600">Access: Dashboard → Settings → Danger Zone → Delete Account.<br />
                Effect: Permanent. Before deletion, the system automatically: (1) cancels any active Stripe subscription, (2) calculates your final balance for the current month, (3) if a balance is owed, presents a payment screen — account deletion proceeds only after payment is completed. After deletion: all campaigns are paused, Vigmis is disconnected from your Meta, Google, and TikTok accounts, and all campaign data, strategy, and settings are permanently removed. Billing invoices and audit records are retained as required by law.</p>
              </div>
            </div>

            <p className="mb-3 font-semibold text-slate-800">16.2 — Billing obligations on exit</p>
            <p className="mb-3"><strong>Grow plan:</strong> You are obligated to pay the management fee on all ad spend from the first day of the current calendar month to the date of deletion. The system calculates this automatically. If a balance is owed, you will be asked to pay via Stripe before the account is deleted.</p>
            <p className="mb-3"><strong>Scale plan:</strong> The subscription fee for the current billing period is non-refundable. If you delete your account, the system cancels your subscription automatically (no further renewals) and then calculates any remaining management fee on ad spend for the current month. If a balance is owed, payment is required via Stripe before deletion completes.</p>

            <p className="mb-3 font-semibold text-slate-800">16.3 — Data export</p>
            <p className="mb-3">Before deleting your account, you may download all your data (campaigns, settings, audit history) as a JSON file from Dashboard → Settings → Export Data. This export is available until the moment of deletion.</p>

            <p className="mb-3 font-semibold text-slate-800">16.4 — What happens to connected platforms</p>
            <p className="mb-3">Upon account deletion, Vigmis automatically revokes its OAuth access from Meta (Facebook/Instagram), Google Ads, Google Analytics, and TikTok. You can verify this in each platform's connected-apps settings. Vigmis does not retain any platform access tokens after deletion.</p>

            <p className="mb-3 font-semibold text-slate-800">16.5 — Termination by Vigmis</p>
            <p className="mb-3">We may suspend or terminate your account immediately, without prior notice, for: violation of these Terms or our Acceptable Use Policy; fraudulent activity; non-payment of fees; or conduct that may expose Vigmis to legal, reputational, or platform-relationship risk. Upon termination by Vigmis, campaigns will be paused and account data deleted in the same manner as a user-initiated deletion. You remain liable for any fees accrued prior to termination.</p>

            <p className="mb-3 font-semibold text-slate-800">16.6 — Right to return</p>
            <p>After deleting your account, you may create a new Vigmis account at any time using the same or a different email address. No prior account history is retained or restored.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">17. Governing Law & Dispute Resolution</h2>
            <p className="mb-3">These Terms are governed by the laws of the State of Israel, without regard to conflict of law provisions. Any dispute arising from or relating to these Terms or the Service shall be subject to the exclusive jurisdiction of the competent courts of Tel Aviv, Israel.</p>
            <p>Before initiating legal proceedings, you agree to attempt in good faith to resolve any dispute informally by contacting <a href="mailto:legal@vigmis.com" className="text-indigo-600 hover:underline">legal@vigmis.com</a> and allowing 30 days for resolution.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">18. Modifications to Terms</h2>
            <p>We may update these Terms at any time. For material changes, we will provide at least 14 days' notice via email or in-app notification. Continued use of the Service after the effective date of updated Terms constitutes your acceptance. If you do not agree to the updated Terms, you must cease using the Service and cancel your account.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">19. Miscellaneous</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><strong>Severability:</strong> If any provision of these Terms is found unenforceable, the remaining provisions continue in full force.</li>
              <li><strong>Entire Agreement:</strong> These Terms, together with the Privacy Policy and Acceptable Use Policy, constitute the entire agreement between you and Vigmis regarding the Service.</li>
              <li><strong>No Waiver:</strong> Failure to enforce any right under these Terms does not constitute a waiver of that right.</li>
              <li><strong>Assignment:</strong> You may not assign your rights under these Terms without our prior written consent. Vigmis may assign its rights without restriction.</li>
              <li><strong>Language:</strong> These Terms are provided in English. In case of conflict between translations, the English version prevails.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">20. Contact</h2>
            <p>Legal notices and queries: <a href="mailto:legal@vigmis.com" className="text-indigo-600">legal@vigmis.com</a><br />
            Billing disputes: <a href="mailto:billing@vigmis.com" className="text-indigo-600">billing@vigmis.com</a><br />
            Security issues: <a href="mailto:security@vigmis.com" className="text-indigo-600">security@vigmis.com</a><br />
            General support: <a href="mailto:support@vigmis.com" className="text-indigo-600">support@vigmis.com</a></p>
          </section>

        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
