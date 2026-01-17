import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (_request, _reply) => {
    fastify.log.debug('Health check requested');

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'aidstation-api',
      version: '0.1.0',
    };
  });

  fastify.get('/health/ready', async (_request, _reply) => {
    fastify.log.debug('Readiness check requested');

    // TODO: Add database and Redis connectivity checks
    return {
      status: 'ready',
      checks: {
        database: 'ok',
        redis: 'ok',
        python_worker: 'ok',
      },
    };
  });
}
