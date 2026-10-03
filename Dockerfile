FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build && pnpm prune --prod --ignore-scripts && pnpm add prisma@6 tsx --ignore-scripts

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
EXPOSE 3000
# Apply migrations and the idempotent bootstrap seed, then serve.
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed && pnpm start"]
