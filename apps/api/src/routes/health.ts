import { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    return reply.send({
      status: 'healthy',
      service: 'DemoForge',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });
};
