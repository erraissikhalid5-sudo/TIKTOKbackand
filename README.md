# TikTok Downloader Backend

A robust, production-ready TypeScript/Express backend for resolving TikTok video metadata and downloading videos as **MP4** or extracting audio as **MP3**. Built for one-click deployment on **Railway** via GitHub.

## Features

- 🎬 Download TikTok videos as MP4 (no watermark, when source data allows it)
- 🎵 Extract audio as MP3 via `ffmpeg`
- 🔎 `/resolve` endpoint to preview metadata before downloading
- 🛡️ Input validation (Zod), rate limiting, Helmet security headers, CORS
- 🔁 Resilient extraction with automatic strategy fallback
- 🧹 Automatic cleanup of temp files (cron-based TTL purge)
- 📄 Swagger/OpenAPI docs at `/docs`
- 🐳 Dockerfile + docker-compose for local/prod parity
- 🚂 `railway.json` + `nixpacks.toml` for Railway deployment
- ✅ GitHub Actions CI (lint + build)

## Project structure

```
tiktok-downloader-backend/
├── src/
│   ├── controllers/     # Request handlers
│   ├── routes/          # Express route definitions
│   ├── services/        # TikTok extraction, conversion, cleanup
│   ├── middlewares/      # Error handling, validation, rate limiting
│   ├── utils/            # Logger, file helpers
│   ├── config/           # Environment-driven config
│   ├── types/             # Shared TypeScript types
│   ├── app.ts            # Express app assembly
│   └── server.ts         # Entry point
├── docs/                 # API docs
├── swagger/               # OpenAPI spec
├── temp/                  # Ephemeral downloaded/converted files
├── Dockerfile
├── docker-compose.yml
├── railway.json
├── nixpacks.toml
└── .github/workflows/ci.yml
```

## Quick start (local)

```bash
git clone <your-repo-url>
cd tiktok-downloader-backend
cp .env.example .env
npm install
npm run dev
```

Server starts at `http://localhost:3000`. Docs at `http://localhost:3000/docs`.

### Using Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

## API overview

| Method | Endpoint                | Description                          |
|--------|--------------------------|---------------------------------------|
| GET    | `/api/v1/health`         | Health check                          |
| POST   | `/api/v1/resolve`        | Get video metadata only               |
| POST   | `/api/v1/download`       | Download as `mp4` or `mp3`            |
| GET    | `/api/v1/files/:fileName`| Fetch the prepared file               |

See [`docs/API.md`](docs/API.md) for full request/response examples.

### Example request

```bash
curl -X POST https://<your-app>.up.railway.app/api/v1/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://vt.tiktok.com/ABCDEFG/", "format": "mp3"}'
```

## Deploying to Railway (via GitHub)

1. Push this repository to GitHub.
2. In Railway, click **New Project → Deploy from GitHub repo** and select your repo.
3. Railway will detect `railway.json` and build using the included `Dockerfile` (recommended, since it installs `ffmpeg`). If you prefer Nixpacks instead of Docker, change `"builder"` in `railway.json` to `"NIXPACKS"` — the included `nixpacks.toml` already installs `ffmpeg` for that path too.
4. In the Railway service **Variables** tab, copy the keys from `.env.example` and set values as needed. At minimum, set:
   - `PUBLIC_BASE_URL` → your Railway-generated domain (e.g. `https://tiktok-downloader-backend-production.up.railway.app`)
5. Deploy. Railway will run health checks against `/api/v1/health`.
6. (Optional) Add a custom domain in Railway's **Settings → Networking**.

## Environment variables

See [`.env.example`](.env.example) for the full list, including rate limiting, file TTL, max file size, and extraction strategy toggles.

## Important notes & limitations

- **Unofficial API**: TikTok has no public download API. This service scrapes TikTok's web page and falls back to a public resolver API when scraping fails. TikTok may change its site structure at any time, which can require updates to `src/services/tiktok.service.ts`.
- **Legal/ToS**: Downloading content may be subject to TikTok's Terms of Service and the rights of content creators. Use this tool only for content you own, have permission to use, or where downloading is otherwise permitted (e.g. personal backup of your own uploads). You are responsible for complying with applicable laws and platform terms in your jurisdiction.
- **Ephemeral storage**: Files are written to `temp/` and auto-purged after `FILE_TTL_MINUTES`. Railway's filesystem is ephemeral between deploys/restarts, which is fine for this short-lived-file design — do not rely on `temp/` for persistent storage.
- **Scaling**: For high traffic, consider moving temp files to object storage (S3-compatible) and running multiple replicas behind Railway's load balancer.

## License

MIT — adapt as needed for your project.
