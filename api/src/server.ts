import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { jobsRoutes } from './routes/jobs';

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

async function main() {
  // Register CORS
  await fastify.register(cors, {
    origin: '*',
  });

  // Register Static Serving for files in STORAGE_PATH
  await fastify.register(fastifyStatic, {
    root: config.STORAGE_PATH,
    prefix: '/storage/',
    decorateReply: false,
  });

  // Register Jobs Routes
  await fastify.register(jobsRoutes);

  // Health check route
  fastify.get('/health', async () => {
    return { status: 'OK' };
  });

  try {
    const address = await fastify.listen({ port: config.PORT, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${address}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
