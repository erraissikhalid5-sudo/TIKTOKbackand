import express, { Application, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { randomUUID } from 'crypto';
import config from './config';
import downloadRoutes from './routes/download.routes';
import healthRoutes from './routes/health.routes';
import { apiRateLimiter } from './middlewares/rateLimiter';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import logger from './utils/logger';

export function createApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request-id + timing
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { id: string }).id =
      (req.headers['x-request-id'] as string) || randomUUID();
    next();
  });

  app.use(
    morgan(
      ':method :url :status :res[content-length] - :response-time ms',
      { stream: { write: (msg: string) => logger.info(msg.trim()) } }
    )
  );

  app.use('/api/v1', apiRateLimiter);
  app.use('/api/v1', healthRoutes);
  app.use('/api/v1', downloadRoutes);

  try {
    const swaggerDocument = YAML.load(path.join(__dirname, '..', 'swagger', 'swagger.yaml'));
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  } catch (err) {
    logger.warn(`Swagger docs unavailable: ${(err as Error).message}`);
  }

  app.get('/', (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        name: 'tiktok-downloader-backend',
        docs: '/docs',
        health: '/api/v1/health',
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
