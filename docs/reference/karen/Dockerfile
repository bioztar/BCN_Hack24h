# One image, one process: Fastify serving the static web app and the SSE chat.
# Multi-stage so the native better-sqlite3 build toolchain never reaches the runtime layer.
# No bundler: the server runs its TypeScript through tsx, the browser gets plain ES modules.

FROM node:22-bookworm-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev --ignore-scripts \
 && npm rebuild better-sqlite3 \
 && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=8795 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY config ./config
COPY assets ./assets
COPY packages ./packages
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME ["/data"]
EXPOSE 8795
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8795/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/tsx/dist/cli.mjs", "packages/server/src/main.ts"]
