import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../types';

const tiktokUrlPattern = /^(https?:\/\/)?(www\.|vm\.|vt\.|m\.)?tiktok\.com\/.+/i;

export const downloadSchema = z.object({
  url: z
    .string({ required_error: 'url is required' })
    .trim()
    .min(1, 'url is required')
    .refine((val) => tiktokUrlPattern.test(val), {
      message: 'url must be a valid TikTok link (tiktok.com, vm.tiktok.com, vt.tiktok.com)',
    }),
  format: z.enum(['mp4', 'mp3'], {
    errorMap: () => ({ message: "format must be either 'mp4' or 'mp3'" }),
  }),
});

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      next(new AppError('Invalid request payload', 400, 'VALIDATION_ERROR', details));
      return;
    }
    req.body = result.data;
    next();
  };
}
