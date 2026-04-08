// Centralised error handler for Fastify
// All errors flow through here and return a consistent JSON shape

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export interface ApiError {
  error: string;
  message?: string;
  statusCode: number;
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  request.log.error({ err: error, url: request.url }, 'Request error');

  // Zod / validation errors
  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation error',
      message: error.message,
      statusCode: 400,
    } satisfies ApiError);
  }

  const statusCode = error.statusCode ?? 500;
  const message =
    statusCode < 500 ? error.message : 'Internal server error';

  return reply.code(statusCode).send({
    error: error.name ?? 'Error',
    message,
    statusCode,
  } satisfies ApiError);
}
