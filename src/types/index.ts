export interface TikTokVideoMeta {
  id: string;
  title: string;
  author: {
    username: string;
    nickname: string;
    avatar?: string;
  };
  coverUrl?: string;
  musicUrl?: string;
  durationSeconds?: number;
  playUrl: string; // direct no-watermark mp4 url
  stats?: {
    plays?: number;
    likes?: number;
    shares?: number;
    comments?: number;
  };
}

export type DownloadFormat = 'mp4' | 'mp3';

export interface DownloadRequestBody {
  url: string;
  format: DownloadFormat;
}

export interface DownloadJobResult {
  jobId: string;
  format: DownloadFormat;
  fileName: string;
  filePath: string;
  fileUrl: string;
  sizeBytes: number;
  meta: TikTokVideoMeta;
  expiresAt: string;
}

export interface ApiErrorShape {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccessShape<T> {
  success: true;
  data: T;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
