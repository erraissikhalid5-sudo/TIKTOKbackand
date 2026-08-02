# syntax=docker/dockerfile:1.6

# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package*.json ./
# Skip ffmpeg-static binary download during build (we use system ffmpeg at runtime).
ENV FFMPEG_SKIP_DOWNLOAD=true
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY swagger ./swagger
RUN npm run build

# ---- Production stage ----
FROM node:20-slim AS production
WORKDIR /app
ENV NODE_ENV=production \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFMPEG_SKIP_DOWNLOAD=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && mkdir -p temp \
    && chown -R node:node /app

COPY --from=builder /app/dist ./dist
COPY swagger ./swagger

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/api/v1/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
