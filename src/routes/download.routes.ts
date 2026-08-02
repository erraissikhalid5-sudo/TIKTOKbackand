import { Router } from 'express';
import { handleDownload, handleResolve, handleServeFile } from '../controllers/download.controller';
import { validateBody, downloadSchema } from '../middlewares/validateRequest';
import { z } from 'zod';

const router = Router();

const resolveSchema = z.object({
  url: z.string().min(1, 'url is required'),
});

/**
 * @route POST /api/v1/resolve
 * @desc  Fetch TikTok video metadata without downloading the media
 */
router.post('/resolve', validateBody(resolveSchema), handleResolve);

/**
 * @route POST /api/v1/download
 * @desc  Download a TikTok video as MP4 or extract audio as MP3
 * @body  { url: string, format: 'mp4' | 'mp3' }
 */
router.post('/download', validateBody(downloadSchema), handleDownload);

/**
 * @route GET /api/v1/files/:fileName
 * @desc  Serve / stream a previously prepared file for download
 */
router.get('/files/:fileName', handleServeFile);

export default router;
