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
  reply.type('text/html').send('<html><head><title>Terms of Service</title></head><body><h1>Terms of Service for VIGMIS</h1><p>By using VIGMIS, you agree to our terms of service. For full terms visit https://vigmis.com/terms</p></body></html>'),
);
app.get('/privacy', async (_req, reply) =>
  reply.type('text/html').send('<html><head><title>Privacy Policy</title></head><body><h1>Privacy Policy for VIGMIS</h1><p>VIGMIS respects your privacy. For full policy visit https://vigmis.com/privacy</p></body></html>'),
);
app.get('/tiktokFKdY6CjQCCckeNNfGdHVhCnsLNqaeO3u.txt', async (_req, reply) =>
  reply.type('text/plain').send('tiktok-developers-site-verification=FKdY6CjQCCckeNNfGdHVhCnsLNqaeO3u'),
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

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });
console.log(`API running on http://${host}:${port}`);
