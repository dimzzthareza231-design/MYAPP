# bun.lock is the canonical lockfile; package-lock.json is legacy and unused.
FROM oven/bun:1.4.5 AS builder
WORKDIR /app
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile
COPY . .
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
