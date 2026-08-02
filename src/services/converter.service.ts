import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import { AppError, DownloadFormat, TikTokVideoMeta } from '../types';
import { ensureTempDir, sanitizeFileName, deleteFileQuietly } from '../utils/fileUtils';
import { streamMediaTo } from './tiktok.service';
import logger from '../utils/logger';

// Resolve ffmpeg binary once at module load.
const resolvedFfmpegPath: string | null =
  config.ffmpegPath || (ffmpegStatic as string | null) || null;

if (resolvedFfmpegPath) {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
  logger.info(`ffmpeg binary: ${resolvedFfmpegPath}`);
} else {
  logger.warn('ffmpeg binary not found — MP3 requests will return FFMPEG_NOT_INSTALLED');
}

function assertFfmpegAvailable(): void {
  if (!resolvedFfmpegPath || !fs.existsSync(resolvedFfmpegPath)) {
    throw new AppError(
      'FFmpeg is not installed or not accessible on this server.',
      500,
      'FFMPEG_NOT_INSTALLED',
      { attemptedPath: resolvedFfmpegPath }
    );
  }
}

interface DownloadedFile {
  jobId: string;
  filePath: string;
  fileName: string;
  bytes: number;
}

/** Streams the source MP4 into a temp file with size guard + typed errors. */
async function downloadRawVideo(meta: TikTokVideoMeta, jobId: string): Promise<{ path: string; bytes: number }> {
  ensureTempDir();
  const rawPath = path.join(config.tempDir, `${jobId}_raw.mp4`);

  let response;
  try {
    response = await streamMediaTo(meta.playUrl);
  } catch (err) {
    throw err; // already AppError
  }

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(rawPath);
    let bytesWritten = 0;
    let settled = false;
    const maxBytes = config.maxFileSizeMb * 1024 * 1024;

    const cleanup = async (rejectErr?: unknown) => {
      if (settled) return;
      settled = true;
      try {
        writer.destroy();
        response.data?.destroy?.();
      } catch {
        /* ignore */
      }
      if (rejectErr) {
        await deleteFileQuietly(rawPath);
        reject(rejectErr);
      }
    };

    response.data.on('data', (chunk: Buffer) => {
      bytesWritten += chunk.length;
      if (bytesWritten > maxBytes) {
        void cleanup(
          new AppError(
            `Video exceeds ${config.maxFileSizeMb}MB limit`,
            413,
            'FILE_TOO_LARGE',
            { bytesWritten, limit: maxBytes }
          )
        );
      }
    });

    response.data.on('error', (err: Error) => {
      void cleanup(
        new AppError(`Media stream error: ${err.message}`, 502, 'DOWNLOAD_FAILED')
      );
    });
    writer.on('error', (err: Error) => {
      void cleanup(
        new AppError(`Filesystem write error: ${err.message}`, 500, 'FILESYSTEM_ERROR', {
          path: rawPath,
        })
      );
    });
    writer.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve({ path: rawPath, bytes: bytesWritten });
    });

    response.data.pipe(writer);
  });
}

export async function prepareMp4(meta: TikTokVideoMeta): Promise<DownloadedFile> {
  const jobId = uuidv4();
  const { path: rawPath, bytes } = await downloadRawVideo(meta, jobId);
  const safeName = sanitizeFileName(meta.title || meta.id);
  const fileName = `${safeName || 'tiktok'}_${jobId.slice(0, 8)}.mp4`;
  const finalPath = path.join(config.tempDir, fileName);

  try {
    await fs.promises.rename(rawPath, finalPath);
  } catch (err) {
    await deleteFileQuietly(rawPath);
    throw new AppError(
      `Could not move downloaded file: ${(err as Error).message}`,
      500,
      'FILESYSTEM_ERROR'
    );
  }

  return { jobId, filePath: finalPath, fileName, bytes };
}

export async function prepareMp3(meta: TikTokVideoMeta): Promise<DownloadedFile> {
  assertFfmpegAvailable();
  const jobId = uuidv4();
  const { path: rawPath } = await downloadRawVideo(meta, jobId);
  const safeName = sanitizeFileName(meta.title || meta.id);
  const fileName = `${safeName || 'tiktok'}_${jobId.slice(0, 8)}.mp3`;
  const finalPath = path.join(config.tempDir, fileName);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(rawPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(192)
      .format('mp3')
      .on('start', (cmd) => logger.info(`ffmpeg: ${cmd}`))
      .on('error', (err: Error) => {
        logger.error(`ffmpeg conversion failed: ${err.message}`);
        const code = /ENOENT|not found/i.test(err.message)
          ? 'FFMPEG_NOT_INSTALLED'
          : 'FFMPEG_ERROR';
        reject(new AppError(`FFmpeg failure: ${err.message}`, 500, code));
      })
      .on('end', () => resolve())
      .save(finalPath);
  });

  await deleteFileQuietly(rawPath);
  const stat = await fs.promises.stat(finalPath);
  return { jobId, filePath: finalPath, fileName, bytes: stat.size };
}

export async function prepareDownload(
  meta: TikTokVideoMeta,
  format: DownloadFormat
): Promise<DownloadedFile> {
  return format === 'mp3' ? prepareMp3(meta) : prepareMp4(meta);
}
