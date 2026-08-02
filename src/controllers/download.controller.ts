import { NextFunction, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import config from '../config';
import { resolveTikTokVideo } from '../services/tiktok.service';
import { prepareDownload } from '../services/converter.service';
import { getFileSize } from '../utils/fileUtils';
import { ApiSuccessShape, DownloadJobResult, DownloadRequestBody } from '../types';
import logger from '../utils/logger';

export async function handleResolve(
  req: Request<unknown, unknown, { url: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  const started = Date.now();
  try {
    const { url } = req.body;
    const { meta, extractor } = await resolveTikTokVideo(url);
    logger.info(
      `resolve ok | extractor=${extractor} | ms=${Date.now() - started} | id=${meta.id}`
    );
    res.status(200).json({ success: true, data: meta } as ApiSuccessShape<typeof meta>);
  } catch (err) {
    next(err);
  }
}

export async function handleDownload(
  req: Request<unknown, unknown, DownloadRequestBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  const started = Date.now();
  const { url, format } = req.body;
  logger.info(`download start | format=${format} | url=${url}`);

  try {
    const { meta, extractor } = await resolveTikTokVideo(url);
    logger.info(`download extracted | extractor=${extractor} | ms=${Date.now() - started}`);

    const file = await prepareDownload(meta, format);
    const sizeBytes = await getFileSize(file.filePath);

    const expiresAt = new Date(
      Date.now() + config.fileTtlMinutes * 60 * 1000
    ).toISOString();

    const result: DownloadJobResult = {
      jobId: file.jobId,
      format,
      fileName: file.fileName,
      filePath: file.filePath,
      fileUrl: `${config.publicBaseUrl}/api/v1/files/${encodeURIComponent(file.fileName)}`,
      sizeBytes,
      meta,
      expiresAt,
    };

    logger.info(
      `download ok | extractor=${extractor} | bytes=${sizeBytes} | file=${file.fileName} | totalMs=${
        Date.now() - started
      }`
    );

    res.status(201).json({ success: true, data: result } as ApiSuccessShape<DownloadJobResult>);
  } catch (err) {
    logger.warn(
      `download fail | url=${url} | format=${format} | ms=${Date.now() - started} | ${
        (err as Error).message
      }`
    );
    next(err);
  }
}

export async function handleServeFile(
  req: Request<{ fileName: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { fileName } = req.params;
    const safeName = path.basename(fileName);
    const filePath = path.join(config.tempDir, safeName);

    if (!filePath.startsWith(config.tempDir) || !fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: 'File not found or has expired' },
      });
      return;
    }
    res.download(filePath, safeName);
  } catch (err) {
    next(err);
  }
}
