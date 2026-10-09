# One image, one process: Fastify serves the API, SSE, the built web app and generated assets.
# SQLite is node:sqlite (built into Node 22), so there is no native toolchain anywhere.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --ignore-scripts
RUN npm run build --workspaces --if-present \
 && npm prune --omit=dev --ignore-scripts \
 && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    PORT=8796 \
    HOST=0.0.0.0 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY package.json ./
COPY corpus ./corpus
COPY content ./content
# Generated media is mounted at /app/assets/generated (compose.yaml); missing is fine.
RUN mkdir -p /data /app/assets/generated && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8796
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8796/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/tsx/dist/cli.mjs", "packages/server/src/main.ts"]
