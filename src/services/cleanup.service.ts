import cron from 'node-cron';
import { purgeExpiredFiles } from '../utils/fileUtils';
import logger from '../utils/logger';

/**
 * Runs every 5 minutes and removes temp files older than the configured TTL.
 * Prevents unbounded disk usage growth on the Railway container.
 */
export function startCleanupScheduler(): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await purgeExpiredFiles();
    } catch (err) {
      logger.error(`Cleanup scheduler error: ${(err as Error).message}`);
    }
  });
  logger.info('Cleanup scheduler started (runs every 5 minutes)');
}
