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

// Startup guard: VIGMIS_TEST_SECRET is a development backdoor.
// Reject startup whenever it is set outside of an explicit local-dev environment
// (NODE_ENV=development). Railway does NOT set NODE_ENV, so the old === 'production'
// check was dead — this inversion ensures the guard actually fires in any non-dev env.
if (process.env.VIGMIS_TEST_SECRET && process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  throw new Error('VIGMIS_TEST_SECRET must not be set outside local development (NODE_ENV must be development or test)');
}

async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  let token: string | null = null;

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  if (!token) {
    return reply.code(401).send({ error: 'Missing authorization header' });
  }

  // Internal test auth: "test:SECRET:TENANT_ID" — only active when VIGMIS_TEST_SECRET is set
  const testSecret = process.env.VIGMIS_TEST_SECRET;
  if (testSecret && token.startsWith('test:')) {
    const parts = token.split(':');
    if (parts.length === 3 && parts[1] === testSecret) {
      request.tenantId = parts[2];
      request.clerkUserId = `test_${parts[2]}`;
      return;
    }
    return reply.code(401).send({ error: 'Invalid test token' });
  }

  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    const clerkUserId = payload.sub;

    // Resolve or create tenant row.
    // Priority: own tenant → team membership → create new tenant.
    let { data: tenant } = await db
      .from('tenants')
      .select('id')
      .eq('clerk_user_id', clerkUserId)
      .maybeSingle();

    if (!tenant) {
      // Check if this user accepted a team invite and belongs to another tenant
      const { data: membership } = await db
        .from('team_members')
        .select('tenant_id')
        .eq('clerk_user_id', clerkUserId)
        .maybeSingle();

      if (membership) {
        request.tenantId = membership.tenant_id;
        request.clerkUserId = clerkUserId;
        return;
      }

      // New user — create their own tenant
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
