# ---- base ----
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

# ---- build ----
FROM base AS build
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile
RUN pnpm exec prisma generate
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
RUN cp -r generated dist/

EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate resolve --applied 0_init 2>/dev/null; pnpm exec prisma migrate deploy && node dist/src/main"]