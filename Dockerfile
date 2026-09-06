FROM node:22-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app
RUN npm install -g pnpm

FROM base AS builder
COPY package.json pnpm-lock.yaml prisma.config.ts ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
RUN pnpm exec prisma generate
COPY . .
RUN pnpm run build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma.config.ts ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma/generated ./prisma/generated
EXPOSE 9097
# CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
# CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/prisma/seed.js ; node dist/src/main.js"]
CMD ["sh", "-c", "echo '🔄 Starting migrations...' ; (npx prisma migrate deploy || echo '⚠️ Migration error') ; echo '🔄 Starting seeding...' ; (node dist/src/core/seed/run-seed.js || echo '⚠️ Seeding error') ; echo '🚀 Starting server on port 9097...' ; node dist/src/main.js"]
