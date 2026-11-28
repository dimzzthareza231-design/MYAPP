# ==========================================
# Multi-stage Production Dockerfile for MYITARU SIMRS
# ==========================================

# Stage 1: Build
# node:sqlite (local D1 stand-in) needs Node 22.
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies for TypeScript & Vite build).
# --ignore-scripts: `prepare` installs git hooks from scripts/, which is not copied yet.
RUN npm ci --ignore-scripts

# Copy full application source code
COPY . .

# Run production build (core SPA to dist/ + esbuild server bundle to dist/server.cjs)
RUN npm run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests and install runtime dependencies
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled dist folder from builder stage
COPY --from=builder /app/dist ./dist
# Migrations are applied at startup to the local SQLite files in .wrangler/node-dev (mount a volume there to keep data).
COPY --from=builder /app/migrations ./migrations

# Expose container port
EXPOSE 3000

# Run production server
CMD ["node", "dist/server.cjs"]
