import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import config from '../config';
import logger from './logger';

export function ensureTempDir(): void {
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

export async function getFileSize(filePath: string): Promise<number> {
  const stat = await fsp.stat(filePath);
  return stat.size;
}

export async function deleteFileQuietly(filePath: string): Promise<void> {
  try {
    await fsp.unlink(filePath);
  } catch (err) {
    // Ignore missing file errors, log anything else
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Failed to delete file ${filePath}: ${(err as Error).message}`);
    }
  }
}

/**
 * Removes files in the temp directory older than the configured TTL.
 */
export async function purgeExpiredFiles(): Promise<void> {
  ensureTempDir();
  const files = await fsp.readdir(config.tempDir);
  const now = Date.now();
  const ttlMs = config.fileTtlMinutes * 60 * 1000;

  await Promise.all(
    files
      .filter((f) => f !== '.gitkeep')
      .map(async (file) => {
        const filePath = path.join(config.tempDir, file);
        try {
          const stat = await fsp.stat(filePath);
          if (now - stat.mtimeMs > ttlMs) {
            await deleteFileQuietly(filePath);
            logger.info(`Purged expired temp file: ${file}`);
          }
        } catch {
          // File may have already been removed; ignore
        }
      })
  );
}
