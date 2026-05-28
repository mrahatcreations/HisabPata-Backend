ARG JWT_SECRET
ARG DATABASE_URL
ARG NODE_ENV

FROM node:20-alpine AS builder
WORKDIR /app

ARG JWT_SECRET
ARG DATABASE_URL
ARG NODE_ENV

COPY package.json package-lock.json ./
# lock file predates sharp; npm install syncs from package.json in CI/Docker
RUN npm install --no-audit --no-fund

COPY prisma ./prisma
COPY prisma.config.js ./
RUN npx prisma generate

FROM node:20-alpine AS runner
WORKDIR /app

ARG JWT_SECRET
ARG NODE_ENV

RUN apk add --no-cache wget

COPY --from=builder /app/node_modules ./node_modules
COPY . .
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "index.js"]
