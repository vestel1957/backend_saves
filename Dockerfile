# ---- base ----
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

# ---- deps ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY --from=build /app/prisma ./prisma
RUN pnpm install --frozen-lockfile --prod
RUN pnpm exec prisma generate

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main"]