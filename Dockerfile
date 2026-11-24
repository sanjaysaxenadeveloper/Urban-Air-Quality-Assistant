# syntax=docker/dockerfile:1

# --- Stage 1: Install dependencies & build Vite frontend ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: Production runtime image for Google Cloud Run ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled frontend bundle and backend runtime sources
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Run as non-root user for Cloud Run hardening
USER node

EXPOSE 8080

# Uses Node 22 native TypeScript stripping or tsx; tsx is in dependencies if needed,
# or node --experimental-strip-types server.ts works directly on Node 22+.
CMD ["npx", "tsx", "server.ts"]
