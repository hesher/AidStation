import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { healthRoutes } from './routes/health';
import { raceRoutes } from './routes/races';
import { activityRoutes } from './routes/activities';
import { planRoutes } from './routes/plans';

const app = Fastify({
  logger: true,
});

async function start() {
  // Register plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET || 'aidstation-cookie-secret-dev',
  });

  // Register routes
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(raceRoutes, { prefix: '/api' });
  await app.register(activityRoutes, { prefix: '/api' });
  await app.register(planRoutes, { prefix: '/api' });

  // Start server
  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`🚀 API Server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { app };
