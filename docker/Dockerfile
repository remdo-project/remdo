###############################
# Builder: compile SPA assets #
###############################
FROM node:24.12-alpine AS builder

WORKDIR /app

# Enable the pinned package manager and install dependencies
RUN corepack enable

COPY \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.json \
  vite.config.mts \
  index.html \
  ./

COPY src ./src
COPY config ./config
COPY public ./public
COPY tools ./tools

RUN pnpm install --frozen-lockfile --prod \
  && NODE_ENV=production ./tools/env.sh pnpm run build

# Bundle server tools for runtime use (no pnpm dependency in runner).
RUN mkdir -p /usr/local/bin \
  && pnpm dlx esbuild tools/remdo-api-server.ts \
    --platform=node \
    --format=cjs \
    --bundle \
    --external:better-sqlite3 \
    --target=node22 \
    --tsconfig=tsconfig.json \
    --banner:js='#!/usr/bin/env node' \
    --outfile=/app/remdo-api-server.cjs \
  && pnpm dlx esbuild tools/snapshot.ts \
    --platform=node \
    --format=esm \
    --bundle \
    --external:ws \
    --target=node22 \
    --tsconfig=tsconfig.json \
    --banner:js='#!/usr/bin/env node' \
    --outfile=/app/snapshot.mjs

############################
# Runner: serve SPA + YJS  #
############################
FROM node:24.12-alpine AS runner

ENV YSWEET_VERSION=^0.9.1
ENV NODE_ENV=production

WORKDIR /app

ENV PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin

# hadolint ignore=DL3018
RUN apk add --no-cache caddy \
  && npm install -g "y-sweet@${YSWEET_VERSION}" \
  && mkdir -p /app/data /etc/caddy /srv/remdo /var/log /usr/local/share/remdo

# Install backup script and cron schedule (runs every minute).
COPY docker/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh \
  && echo "* * * * * cd /app && /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root \
  && chmod 600 /etc/crontabs/root \
  && touch /var/log/backup.log

COPY --from=builder /app/data/dist /srv/remdo
COPY --from=builder /app/node_modules /app/node_modules
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /entrypoint.sh
COPY tools/env.defaults.sh /usr/local/share/remdo/env.defaults.sh
COPY docker/entrypoint-env.sh /usr/local/share/remdo/entrypoint-env.sh
COPY --from=builder /app/remdo-api-server.cjs /app/remdo-api-server.cjs
COPY --from=builder /app/snapshot.mjs /app/snapshot.mjs

RUN chmod +x /entrypoint.sh
RUN chmod +x /app/remdo-api-server.cjs
RUN chmod +x /app/snapshot.mjs

EXPOSE 8080

CMD ["/entrypoint.sh"]
