// Conversion Tracking Guide
// Sent once per campaign on day 1 (when first impressions appear).
// Creates a Decision Protocol with step-by-step pixel/tag setup instructions.

import { db } from '@vigmis/db';
import { createProtocol } from '../routes/protocols.js';
import { sendTenantNotification } from './notify.js';

const GUIDE_STEPS: Record<string, { shortTitle: string; steps: string[] }> = {
  meta: {
    shortTitle: 'Meta Pixel',
    steps: [
      'Go to Meta Business Manager → Events Manager → Connect Data Sources → Web → Create Pixel',
      'Copy your Pixel ID (a 16-digit number)',
      'Add the base pixel code to your website <head> section — or use the Meta Pixel plugin for WordPress/Shopify',
      'Add conversion events based on your goal:\n   Lead: fbq("track", "Lead") — fires when a form is submitted\n   Purchase: fbq("track", "Purchase", {value: 0.00, currency: "USD"}) — fires at order confirmation',
      'Verify installation with the Meta Pixel Helper Chrome extension',
      'In Meta Ads Manager → your campaign → Edit → select your Pixel as the conversion event source',
    ],
  },
  google: {
    shortTitle: 'Google Conversion Tracking',
    steps: [
      'In Google Ads → click ⚙ (tools) → Measurement → Conversions → + New conversion action → Website',
      'Fill in: name the action (e.g. "Lead Form Submit"), set the category, value, and count',
      'Google provides a Conversion ID and label (format: AW-123456789/AbCdEfGhIjK)',
      'Add the Google Tag (gtag.js) to your website <head>:\n   <script async src="https://www.googletagmanager.com/gtag/js?id=AW-XXXXXXXXX"></script>\n   Then initialize: gtag("config", "AW-XXXXXXXXX")',
      'On your confirmation/thank-you page only, add:\n   gtag("event", "conversion", {"send_to": "AW-XXXXXXXXX/YourLabel"})',
      'Verify with the Google Tag Assistant Chrome extension — conversion data takes 24-48 hours to appear',
    ],
  },
  tiktok: {
    shortTitle: 'TikTok Pixel',
    steps: [
      'In TikTok Ads Manager → Assets → Events → Web Events → Set Up Web Events → Create Pixel',
      'Choose Developer Mode for manual installation (or use the plugin for Shopify/WooCommerce)',
      'Copy the Pixel Code and paste it into your website <head> section',
      'Add conversion events on the relevant pages:\n   Form submission: ttq.track("SubmitForm")\n   Purchase confirmation: ttq.track("PlaceAnOrder", {value: 0, currency: "USD", quantity: 1})',
      'Verify with the TikTok Pixel Helper Chrome extension',
      'In your TikTok campaign settings, select the pixel and the specific conversion event',
    ],
  },
};

export async function sendTrackingGuide(
  tenantId: string,
  campaignId: string,
  campaignName: string,
  platform: string,
): Promise<void> {
  // Only send once per campaign
  const { data: existing } = await db
    .from('audit_log')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('action', 'tracking_guide.sent')
    .contains('payload', { campaignId })
    .limit(1);

  if (existing?.length) return;

  const guide = GUIDE_STEPS[platform];
  if (!guide) return;

  const stepsText = guide.steps
    .map((step, i) => `${i + 1}. ${step}`)
    .join('\n\n');

  const recommendation = [
    `Your campaign "${campaignName}" is now live on ${platform}. Great news!`,
    ``,
    `One important step remains: setting up conversion tracking.`,
    ``,
    `Why this matters: without it, ${platform} and Vigmis can only optimize for clicks — not for the actual results you care about (leads, purchases). Tracking tells the algorithm which clicks become real customers, so it can find more of them. Campaigns with tracking typically outperform those without by 30-60%.`,
    ``,
    `How to set up ${guide.shortTitle}:`,
    ``,
    stepsText,
    ``,
    `This is a one-time setup — once done, it works for all future campaigns on this platform.`,
    ``,
    `If your website runs on WordPress, Shopify, Wix, or Webflow, there are plugins/integrations that do this without touching code. Reply here with your platform and Vigmis will give you the exact steps.`,
  ].join('\n');

  await createProtocol({
    tenantId,
    type: 'general_advice',
    title: `Action needed: install ${guide.shortTitle} on your website`,
    recommendation,
    approvalText: `I have installed ${guide.shortTitle} on my website and verified it is firing correctly.`,
    approvalSummary: `${guide.shortTitle} installed`,
    actionPayload: { campaignId, platform },
    campaignId,
    platform,
  });

  await sendTenantNotification(
    tenantId,
    `Install ${guide.shortTitle} — required for full optimization`,
    `Your ${platform} campaign is live. Set up ${guide.shortTitle} now to enable conversion tracking and unlock full optimization.`,
    'warning',
    'See setup guide in Decision Protocols',
  ).catch(() => {});

  await db.from('audit_log').insert({
    tenant_id: tenantId,
    action: 'tracking_guide.sent',
    platform,
    actor: 'system',
    payload: { campaignId, campaignName },
  });
}
