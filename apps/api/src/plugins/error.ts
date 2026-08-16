import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@avf/database';
import { AIProviderError } from '@avf/ai';
import { MediaProviderError } from '@avf/media';
import { SocialProviderError } from '@avf/social';
import { ValidationError } from '../lib/validate.js';

/**
 * Central error handler mapping domain errors to HTTP responses.
 * External provider errors are classified (rate limit / auth / timeout / ...)
 * and never crash the process.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  request.log.error({ err: error }, error.message);

  if (error instanceof ValidationError) {
    return void reply.code(400).send({ error: 'validation_error', issues: error.issues });
  }

  if (error instanceof AIProviderError || error instanceof MediaProviderError || error instanceof SocialProviderError) {
    const status = error.code === 'AUTH_ERROR' ? 401 : error.code === 'RATE_LIMIT' ? 429 : 502;
    return void reply.code(status).send({
      error: error.code.toLowerCase(),
      message: error.message,
      retryable: error.retryable,
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return void reply.code(409).send({ error: 'conflict', message: 'A record with that value already exists' });
    }
    if (error.code === 'P2025') {
      return void reply.code(404).send({ error: 'not_found', message: 'Record not found' });
    }
    return void reply.code(400).send({ error: 'database_error', message: error.message });
  }

  if (error.code === 'FST_ERR_NOT_FOUND') {
    return void reply.code(404).send({ error: 'not_found', message: 'Route not found' });
  }

  const status = error.statusCode ?? 500;
  if (status >= 500) {
    return void reply.code(500).send({ error: 'internal_error', message: 'Internal server error' });
  }
  return void reply.code(status).send({ error: error.code ?? 'error', message: error.message });
}
