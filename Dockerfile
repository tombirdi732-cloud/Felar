# ---- Roost backend image ----
FROM node:22-bookworm-slim

# better-sqlite3 ships a prebuilt binary, but keep build tools available
# in case a native rebuild is needed on this platform.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production dependencies first (better layer caching).
COPY package.json ./
# Server needs only runtime deps — skip dev (electron) and optional (capacitor).
# Using `npm install` (not `npm ci`) so a lockfile that also lists desktop/mobile
# dev deps doesn't block the server build.
RUN npm install --omit=dev --omit=optional --no-audit --no-fund

# App source.
COPY server ./server
COPY public ./public

# Runtime config.
ENV NODE_ENV=production
ENV PORT=3000
# SQLite lives on a mounted volume so data survives container restarts.
ENV ROOST_DB=/data/roost.db

EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server/index.js"]
