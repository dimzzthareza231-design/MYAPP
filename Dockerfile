# bun.lock is canonical. Only Firebase WEB configuration is passed to Vite;
# never pass service-account private keys as build args or VITE_* values.
FROM oven/bun:1.4.5 AS builder
WORKDIR /app
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_DATABASE_ID=(default)
RUN bun run build

FROM oven/bun:1.4.5-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=builder --chown=bun:bun /app/dist/main ./dist/main
COPY --from=builder --chown=bun:bun /app/dist/server ./dist/server
USER bun
EXPOSE 3000
CMD ["bun", "dist/server/index.cjs"]
