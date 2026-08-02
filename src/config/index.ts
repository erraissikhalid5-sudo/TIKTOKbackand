import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function envNumber(name: string, fallback: number): number {
  const val = process.env[name];
  if (!val) return fallback;
  const parsed = Number(val);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: envNumber('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',

  corsOrigin: process.env.CORS_ORIGIN || '*',

  rateLimit: {
    windowMs: envNumber('RATE_LIMIT_WINDOW_MS', 60_000),
    max: envNumber('RATE_LIMIT_MAX_REQUESTS', 20),
  },

  tempDir: path.resolve(process.cwd(), process.env.TEMP_DIR || 'temp'),
  fileTtlMinutes: envNumber('FILE_TTL_MINUTES', 15),
  maxFileSizeMb: envNumber('MAX_FILE_SIZE_MB', 200),
  downloadTimeoutMs: envNumber('DOWNLOAD_TIMEOUT_MS', 30_000),

  tiktok: {
    strategy: (process.env.TIKTOK_STRATEGY as 'direct' | 'fallback') || 'fallback',
    fallbackApi: process.env.TIKTOK_FALLBACK_API || 'https://tikwm.com/api/',
    userAgent:
      process.env.TIKTOK_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    cookie: process.env.TIKTOK_COOKIE || '',
  },

  ffmpegPath: process.env.FFMPEG_PATH || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
};

export default config;
