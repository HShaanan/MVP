import Fastify from 'fastify';
import { env } from './config/env';
import { whatsappRoutes } from './controllers/whatsapp.controller';
import { businessRoutes } from './controllers/business.controller';

const app = Fastify({
  logger: {
    level: env.server.nodeEnv === 'production' ? 'info' : 'debug',
    transport:
      env.server.nodeEnv !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

// Parse JSON bodies
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string' },
  (_req, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);

// Health check
app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

// Routes
app.register(whatsappRoutes);
app.register(businessRoutes);

// Start
const start = async () => {
  try {
    await app.listen({ port: env.server.port, host: '0.0.0.0' });
    app.log.info(`Server listening on port ${env.server.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
