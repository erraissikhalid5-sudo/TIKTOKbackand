import axios, { AxiosError, AxiosResponse } from 'axios';
import { AppError, TikTokVideoMeta } from '../types';
import logger from '../utils/logger';
import config from '../config';

const httpClient = axios.create({
  timeout: config.downloadTimeoutMs,
  headers: {
    'User-Agent': config.tiktok.userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    ...(config.tiktok.cookie ? { Cookie: config.tiktok.cookie } : {}),
  },
  maxRedirects: 5,
});

/** Expand short vt./vm. links to canonical URL. */
async function resolveCanonicalUrl(url: string): Promise<string> {
  try {
    const response = await httpClient.get(url, { validateStatus: () => true });
    return response.request?.res?.responseUrl || url;
  } catch (err) {
    logger.warn(`Could not resolve short URL, using original: ${(err as Error).message}`);
    return url;
  }
}

interface StrategyResult {
  meta: TikTokVideoMeta | null;
  strategy: string;
  reason?: string;
}

/** Strategy A: direct HTML scrape for SIGI_STATE / UNIVERSAL_DATA blobs. */
async function fetchViaDirectScrape(url: string): Promise<StrategyResult> {
  const strategy = 'direct-scrape';
  try {
    const canonicalUrl = await resolveCanonicalUrl(url);
    const { data: html, status } = await httpClient.get<string>(canonicalUrl, {
      headers: {
        Referer: 'https://www.tiktok.com/',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Dest': 'document',
      },
      validateStatus: () => true,
    });

    if (status >= 400 || typeof html !== 'string') {
      return { meta: null, strategy, reason: `HTTP ${status}` };
    }

    const universalMatch = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    );
    const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let itemStruct: any = null;

    if (universalMatch) {
      const json = JSON.parse(universalMatch[1]);
      itemStruct =
        json?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct || null;
    } else if (sigiMatch) {
      const json = JSON.parse(sigiMatch[1]);
      const itemModule = json?.ItemModule;
      if (itemModule) {
        const key = Object.keys(itemModule)[0];
        itemStruct = key ? itemModule[key] : null;
      }
    }

    if (!itemStruct) {
      return { meta: null, strategy, reason: 'no itemStruct in HTML (anti-bot page?)' };
    }

    const playUrl: string | undefined =
      itemStruct.video?.playAddr || itemStruct.video?.downloadAddr;

    if (!playUrl) return { meta: null, strategy, reason: 'missing playAddr' };

    return {
      strategy,
      meta: {
        id: String(itemStruct.id),
        title: itemStruct.desc || 'tiktok_video',
        author: {
          username: itemStruct.author?.uniqueId || 'unknown',
          nickname: itemStruct.author?.nickname || 'unknown',
          avatar: itemStruct.author?.avatarMedium?.[0],
        },
        coverUrl: itemStruct.video?.cover,
        musicUrl: itemStruct.music?.playUrl,
        durationSeconds: itemStruct.video?.duration,
        playUrl,
        stats: {
          plays: itemStruct.stats?.playCount,
          likes: itemStruct.stats?.diggCount,
          shares: itemStruct.stats?.shareCount,
          comments: itemStruct.stats?.commentCount,
        },
      },
    };
  } catch (err) {
    const msg = (err as Error).message;
    logger.warn(`[${strategy}] failed: ${msg}`);
    return { meta: null, strategy, reason: msg };
  }
}

/** Strategy B: tikwm.com public resolver. */
async function fetchViaFallbackApi(url: string): Promise<StrategyResult> {
  const strategy = 'tikwm-fallback';
  try {
    const response = await httpClient.get(config.tiktok.fallbackApi, {
      params: { url, hd: 1 },
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      return { meta: null, strategy, reason: `HTTP ${response.status}` };
    }

    const body = response.data;
    if (!body || typeof body !== 'object') {
      return { meta: null, strategy, reason: 'non-JSON body' };
    }
    if (body.code !== 0 && body.code !== undefined) {
      return {
        meta: null,
        strategy,
        reason: `provider error code=${body.code} msg=${body.msg || 'unknown'}`,
      };
    }

    const data = body.data;
    if (!data) return { meta: null, strategy, reason: 'empty data' };

    const playUrl: string | undefined = data.hdplay || data.play || data.wmplay;
    if (!playUrl) return { meta: null, strategy, reason: 'no play url in response' };

    return {
      strategy,
      meta: {
        id: String(data.id ?? ''),
        title: data.title || 'tiktok_video',
        author: {
          username: data.author?.unique_id || 'unknown',
          nickname: data.author?.nickname || 'unknown',
          avatar: data.author?.avatar,
        },
        coverUrl: data.cover,
        musicUrl: data.music,
        durationSeconds: data.duration,
        playUrl,
        stats: {
          plays: data.play_count,
          likes: data.digg_count,
          shares: data.share_count,
          comments: data.comment_count,
        },
      },
    };
  } catch (err) {
    const msg = (err as Error).message;
    logger.warn(`[${strategy}] failed: ${msg}`);
    return { meta: null, strategy, reason: msg };
  }
}

export interface ResolveResult {
  meta: TikTokVideoMeta;
  extractor: string;
}

export async function resolveTikTokVideo(url: string): Promise<ResolveResult> {
  const strategies =
    config.tiktok.strategy === 'direct'
      ? [fetchViaDirectScrape, fetchViaFallbackApi]
      : [fetchViaFallbackApi, fetchViaDirectScrape];

  const attempts: string[] = [];

  for (const strategy of strategies) {
    const result = await strategy(url);
    attempts.push(`${result.strategy}${result.reason ? `(${result.reason})` : ''}`);
    if (result.meta) {
      logger.info(`Extractor succeeded: ${result.strategy}`);
      return { meta: result.meta, extractor: result.strategy };
    }
  }

  throw new AppError(
    'Unable to extract video from the provided TikTok URL. It may be private, region-locked, deleted, or TikTok/tikwm may be blocking this request.',
    422,
    'EXTRACTOR_ERROR',
    { attempts }
  );
}

/** Open a streaming download of the media URL. Wraps axios errors. */
export async function streamMediaTo(playUrl: string): Promise<AxiosResponse> {
  try {
    const response = await httpClient.get(playUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': config.tiktok.userAgent,
        Referer: 'https://www.tiktok.com/',
        ...(config.tiktok.cookie ? { Cookie: config.tiktok.cookie } : {}),
      },
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      // Drain to free the socket
      response.data?.destroy?.();
      throw new AppError(
        `TikTok CDN returned HTTP ${response.status} for the media URL. The signed playback URL may have expired or the source is region-locked.`,
        502,
        'DOWNLOAD_FAILED',
        { status: response.status, playUrl }
      );
    }
    return response;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const axErr = err as AxiosError;
    throw new AppError(
      `Failed to open media stream: ${axErr.message}`,
      502,
      'DOWNLOAD_FAILED',
      { code: axErr.code, playUrl }
    );
  }
}
