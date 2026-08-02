import createApp from './app';
import config from './config';
import logger from './utils/logger';
import { ensureTempDir } from './utils/fileUtils';
import { startCleanupScheduler } from './services/cleanup.service';

async function bootstrap(): Promise<void> {
  ensureTempDir();

  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    logger.info(`🚀 Server running at http://${config.host}:${config.port}`);
    logger.info(`📚 API docs available at http://${config.host}:${config.port}/docs`);
    logger.info(`Environment: ${config.env}`);
  });

  startCleanupScheduler();

  const shutdown = (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    // Force-exit if shutdown hangs
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled Rejection: ${reason}`);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error(`Fatal error during bootstrap: ${(err as Error).message}`);
  process.exit(1);
});
