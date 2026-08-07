FROM node:20-alpine AS base

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/wallet-core/package.json ./packages/wallet-core/
COPY packages/sdk/package.json ./packages/sdk/
COPY apps/worker/package.json ./apps/worker/

RUN corepack enable && corepack prepare pnpm@10.6.1 --activate
RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/worker ./apps/worker

RUN pnpm --filter @vinchi/worker build

EXPOSE 8080

CMD ["node", "apps/worker/dist/index.js"]
