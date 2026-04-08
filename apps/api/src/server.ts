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

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
  credentials: true,
});

await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

app.setErrorHandler(errorHandler);

app.get('/health', async () => ({ status: 'ok', service: 'vigmis-api' }));

await app.register(onboardingRoutes);
await app.register(connectorRoutes);
await app.register(campaignRoutes);
await app.register(optimizationRoutes);
await app.register(billingRoutes);
await app.register(chatRoutes);
await app.register(feedbackRoutes);

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST ?? '0.0.0.0';

await app.listen({ port, host });
console.log(`API running on http://${host}:${port}`);
