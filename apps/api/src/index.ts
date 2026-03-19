import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.js';
import { activateRoutes } from './routes/activate.js';
import { platformSsoRoutes } from './routes/platformSso.js';

const PORT = parseInt(process.env.PORT || '8004', 10);

async function main() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });
  await fastify.register(healthRoutes);
  await fastify.register(activateRoutes, { prefix: '/api/v1' });
  await fastify.register(platformSsoRoutes, { prefix: '/api/v1' });

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`DemoForge API listening on port ${PORT}`);
}

main().catch((err) => {
  console.error('Failed to start DemoForge API:', err);
  process.exit(1);
});
