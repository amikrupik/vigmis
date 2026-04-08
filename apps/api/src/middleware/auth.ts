// Clerk JWT verification middleware for Fastify
// Verifies the Bearer token on every protected route and attaches tenantId

import type { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { verifyToken } from '@clerk/backend';
import { db } from '@vigmis/db';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    clerkUserId: string;
  }
}

async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    const clerkUserId = payload.sub;

    // Resolve or create tenant row
    let { data: tenant } = await db
      .from('tenants')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .single();

    if (!tenant) {
      const { data: newTenant, error } = await db
        .from('tenants')
        .insert({ clerk_user_id: clerkUserId })
        .select('id')
        .single();

      if (error || !newTenant) {
        request.log.error({ error }, 'Failed to create tenant');
        return reply.code(500).send({ error: 'Internal server error' });
      }
      tenant = newTenant;
    }

    request.tenantId = tenant.id;
    request.clerkUserId = clerkUserId;
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', authMiddleware);
};

export default fp(authPlugin);
export { authMiddleware as authenticate };
