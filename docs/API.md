# API Documentation

Interactive Swagger UI is served at `/docs` once the server is running.

## Base URL

```
https://<your-railway-domain>/api/v1
```

## Endpoints

### `GET /health`
Returns service status and uptime. Used by Docker/Railway health checks.

### `POST /resolve`
Resolves metadata for a TikTok URL without downloading media. Useful for previewing title, author, cover image, and stats before committing to a download.

**Body**
```json
{ "url": "https://www.tiktok.com/@username/video/1234567890123456789" }
```

### `POST /download`
Downloads the video and returns a link to the prepared file.

**Body**
```json
{ "url": "https://vt.tiktok.com/ABCDEFG/", "format": "mp4" }
```
`format` must be `"mp4"` or `"mp3"`.

**Response `201`**
```json
{
  "success": true,
  "data": {
    "jobId": "…",
    "format": "mp4",
    "fileName": "my_video_ab12cd34.mp4",
    "fileUrl": "https://<host>/api/v1/files/my_video_ab12cd34.mp4",
    "sizeBytes": 4831201,
    "meta": { "...": "video metadata" },
    "expiresAt": "2026-07-10T13:45:00.000Z"
  }
}
```

### `GET /files/:fileName`
Streams/downloads the prepared file. Files are automatically purged after `FILE_TTL_MINUTES` (default 15 minutes).

## Error format

All errors follow a consistent shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": [ { "path": "format", "message": "format must be either 'mp4' or 'mp3'" } ]
  }
}
```

Common error codes: `VALIDATION_ERROR`, `EXTRACTION_FAILED`, `FILE_TOO_LARGE`, `CONVERSION_FAILED`, `FILE_NOT_FOUND`, `RATE_LIMIT_EXCEEDED`, `INTERNAL_ERROR`.

## Extraction strategy notes

TikTok does not offer a public download API, and frequently changes its web app's internal structure and bot protections. This backend uses a two-layer strategy (`src/services/tiktok.service.ts`):

1. **Direct scrape** — fetches the TikTok video page and parses the embedded `__UNIVERSAL_DATA_FOR_REHYDRATION__` / `SIGI_STATE` JSON.
2. **Fallback resolver API** — if direct scraping fails (layout change, region block, etc.), falls back to a public no-watermark resolver API (configurable via `TIKTOK_FALLBACK_API`).

Because TikTok's page structure changes over time, keep an eye on logs after deployment and be ready to adjust the parsing selectors in `tiktok.service.ts` if extraction starts failing broadly.
