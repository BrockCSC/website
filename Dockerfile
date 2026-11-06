FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Owned up front so a fresh uploads/documents volume inherits nextjs, not root.
RUN mkdir -p /data/uploads /data/documents && chown -R nextjs:nodejs /data

COPY --from=builder /app/public ./public
COPY --from=builder /app/lib/documents/fonts ./lib/documents/fonts
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/heic-decode ./node_modules/heic-decode
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/libheif-js ./node_modules/libheif-js

USER nextjs
EXPOSE 3000
# Single source of truth for container health; deploy/docker-compose.yml relies on it.
# start-period covers the migrate and sync steps that run before the server starts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["wget", "-qO-", "http://127.0.0.1:3000/api/health"]
CMD ["sh", "-c", "node scripts/migrate.mjs && node scripts/sync-from-prod.mjs && node server.js"]
