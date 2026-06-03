import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { errorHandler } from './middleware/error-handler.js';
import { onboardingRoutes } from './routes/onboarding.js';
import { connectorRoutes } from './routes/connectors.js';
import { campaignRoutes } from './routes/campaigns.js';
import { optimizationRoutes } from './routes/optimization.js';
import { billingRoutes } from './routes/billing.js';
import { chatRoutes } from './routes/chat.js';
import { feedbackRoutes } from './routes/feedback.js';
import { analyticsRoutes } from './routes/analytics.js';
import { intelligenceRoutes } from './routes/intelligence.js';
import { alertRoutes } from './routes/alerts.js';
import { creativeRoutes } from './routes/creatives.js';
import { notificationRoutes } from './routes/notifications.js';
import { accountRoutes } from './routes/account.js';
import { protocolRoutes, expireProtocolsRoute } from './routes/protocols.js';
import { socialRoutes } from './routes/social.js';
import { ga4Routes } from './routes/ga4.js';
import { exportRoutes } from './routes/export.js';
import { trackingRoutes } from './routes/tracking.js';
import { geoRoutes } from './routes/geo.js';
import { historyRoutes } from './routes/history.js';
import { policyRoutes } from './routes/policy.js';
import { attestationRoutes } from './routes/attestations.js';
import { readinessRoutes } from './routes/readiness.js';
import { briefingRoutes } from './routes/briefings.js';
import { commentsIntelligenceRoutes } from './routes/comments-intelligence.js';
import { adminRoutes } from './routes/admin.js';
import { explainabilityRoutes } from './routes/explainability.js';
import { complianceCronRoutes } from './routes/compliance-cron.js';
import { operationalRoutes } from './routes/operational.js';
import { teamRoutes } from './routes/team.js';

const app = Fastify({ logger: true });



await app.register(cors, {
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
  credentials: true,
});

await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

app.setErrorHandler(errorHandler);

app.get('/health', async () => ({ status: 'ok', service: 'vigmis-api' }));

// Required by TikTok app verification
app.get('/terms', async (_req, reply) =>
  reply.type('text/html').send('<html><head><title>Terms of Service</title></head><body><h1>Terms of Service for VIGMIS</h1><p>By using VIGMIS, you agree to be bound by these terms. VIGMIS provides an AI-powered advertising management platform. Users are responsible for their ad spend and compliance with platform policies. VIGMIS charges a management fee on managed spend. All fees are non-refundable.</p></body></html>'),
);
app.get('/privacy', async (_req, reply) =>
  reply.type('text/html').send('<html><head><title>Privacy Policy</title></head><body><h1>Privacy Policy for VIGMIS</h1><p>VIGMIS collects business information, ad platform credentials, and usage data solely to provide advertising management services. We do not sell personal data. Data is stored securely and deleted upon account cancellation. Contact: privacy@vigmis.com</p></body></html>'),
);
app.get('/tiktokFKdY6CjQCCckeNNfGdHVhCnsLNqaeO3u.txt', async (_req, reply) =>
  reply.type('text/plain').send('tiktok-developers-site-verification=FKdY6CjQCCckeNNfGdHVhCnsLNqaeO3u'),
);
app.get('/tiktokxtpVXGlmrN2bQls9BPHWzyObIA2cdVzj.txt', async (_req, reply) =>
  reply.type('text/plain').send('tiktok-developers-site-verification=xtpVXGlmrN2bQls9BPHWzyObIA2cdVzj'),
);
app.get('/tiktokJu5VbEdtJ2xOwu1FNRk8Zq8WBIHAqmmH.txt', async (_req, reply) =>
  reply.type('text/plain').send('tiktok-developers-site-verification=Ju5VbEdtJ2xOwu1FNRk8Zq8WBIHAqmmH'),
);
app.get('/tiktok2SCYjNOs8dReqWEv7qIxbxwyLAy1RiVu.txt', async (_req, reply) =>
  reply.type('text/plain').send('tiktok-developers-site-verification=2SCYjNOs8dReqWEv7qIxbxwyLAy1RiVu'),
);

await app.register(onboardingRoutes);
await app.register(connectorRoutes);
await app.register(campaignRoutes);
await app.register(optimizationRoutes);
await app.register(billingRoutes);
await app.register(chatRoutes);
await app.register(feedbackRoutes);
await app.register(analyticsRoutes);
await app.register(intelligenceRoutes);
await app.register(alertRoutes);
await app.register(creativeRoutes);
await app.register(notificationRoutes);
await app.register(accountRoutes);
await app.register(protocolRoutes);
await app.register(expireProtocolsRoute);
await app.register(socialRoutes);
await app.register(ga4Routes);
await app.register(exportRoutes);
await app.register(trackingRoutes);
await app.register(geoRoutes);
await app.register(historyRoutes);
await app.register(policyRoutes);
await app.register(attestationRoutes);
await app.register(readinessRoutes);
await app.register(briefingRoutes);
await app.register(commentsIntelligenceRoutes);
await app.register(adminRoutes);
await app.register(explainabilityRoutes);
await app.register(complianceCronRoutes);
await app.register(operationalRoutes);
await app.register(teamRoutes);

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });
console.log(`API running on http://${host}:${port}`);
