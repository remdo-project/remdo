###############################
# Builder: compile SPA assets #
###############################
FROM node:22-alpine AS builder

WORKDIR /app

# Enable the pinned package manager and install dependencies
RUN corepack enable

ARG PUBLIC_PORT=8080

COPY \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.json \
  vite.config.mts \
  index.html \
  ./

COPY src ./src
COPY lib ./lib
COPY config ./config

# Production build-time env (same-origin proxy on configurable PUBLIC_PORT)
ENV NODE_ENV=production \
  PORT=${PUBLIC_PORT} \
  COLLAB_CLIENT_PORT=${PUBLIC_PORT}

RUN pnpm install --frozen-lockfile && pnpm run build

# Bundle snapshot tool for runtime backups (no pnpm dependency in runner).
RUN mkdir -p /app/bin \
  && pnpm exec tsx --bundle tools/snapshot.ts \
    --format esm \
    --target node22 \
    --sourcemap=inline \
    --outfile /app/bin/snapshot.mjs

############################
# Runner: serve SPA + YJS  #
############################
FROM node:22-alpine AS runner

# TODO: Add a test to ensure this pinned version stays aligned with package.json.
ENV YSWEET_VERSION=^0.9.1

WORKDIR /app

ENV YSWEET_PORT_INTERNAL=8081 \
  APP_PORT=8080

# hadolint ignore=DL3018
RUN apk add --no-cache caddy \
  && npm install -g "y-sweet@${YSWEET_VERSION}" \
  && mkdir -p /data /etc/caddy /srv/remdo /var/log

# Install backup script and cron schedule (runs every minute).
COPY docker/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh \
  && echo "* * * * * cd /app && /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root \
  && chmod 600 /etc/crontabs/root \
  && touch /var/log/backup.log

COPY --from=builder /app/data/dist /srv/remdo
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /entrypoint.sh
COPY --from=builder /app/bin/snapshot.mjs /usr/local/bin/snapshot.mjs

RUN chmod +x /entrypoint.sh
RUN chmod +x /usr/local/bin/snapshot.mjs

EXPOSE 8080

CMD ["/entrypoint.sh"]
