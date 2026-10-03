FROM node:20-slim AS base
# openssl for Prisma; newest PostgreSQL client (PGDG) for pg_dump backups — it can dump any older server.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client \
 && apt-get purge -y gnupg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
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
