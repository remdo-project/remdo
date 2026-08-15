###############################
# Builder: compile SPA assets #
###############################
FROM node:24.19-alpine AS builder

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
COPY patches ./patches
COPY public ./public
COPY tools ./tools

RUN attempt=1 \
  && until pnpm install --frozen-lockfile --prod; do \
    [ "$attempt" -ge 3 ] && exit 1; \
    delay=$((attempt * 5)); \
    echo "pnpm install failed; retrying in ${delay}s"; \
    sleep "$delay"; \
    attempt=$((attempt + 1)); \
  done \
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
  && pnpm dlx esbuild tools/snapshot/cli.ts \
    --platform=node \
    --format=esm \
    --bundle \
    --external:ws \
    --target=node22 \
    --tsconfig=tsconfig.json \
    --banner:js='#!/usr/bin/env node' \
    --outfile=/app/snapshot.mjs \
  && pnpm dlx esbuild tools/snapshot/backup.ts \
    --platform=node \
    --format=esm \
    --bundle \
    --external:better-sqlite3 \
    --external:ws \
    --target=node22 \
    --tsconfig=tsconfig.json \
    --banner:js='#!/usr/bin/env node' \
    --outfile=/app/backup.mjs \
  && pnpm dlx esbuild tools/bootstrap-secrets.ts \
    --platform=node \
    --format=cjs \
    --bundle \
    --target=node22 \
    --tsconfig=tsconfig.json \
    --banner:js='#!/usr/bin/env node' \
    --outfile=/app/bootstrap-secrets.cjs

############################
# Runner: serve SPA + YJS  #
############################
FROM node:24.19-alpine AS runner

ENV NODE_ENV=production
ENV DATA_DIR=/data

WORKDIR /app

ENV PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin

# hadolint ignore=DL3018
RUN apk add --no-cache caddy \
  && mkdir -p /data /etc/caddy /srv/remdo /var/log /usr/local/share/remdo

# Install backup script and cron schedule (runs every minute).
COPY docker/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh \
  && echo "* * * * * cd /app && /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root \
  && chmod 600 /etc/crontabs/root \
  && touch /var/log/backup.log

COPY --from=builder /app/dist /srv/remdo
COPY --from=builder /app/node_modules /app/node_modules
# The package's JavaScript launcher does not forward shutdown signals. Expose
# the downloaded native server at the stable command path used by RemDo.
RUN ln -s /app/node_modules/y-sweet/bin/y-sweet /usr/local/bin/y-sweet \
  && test -x /usr/local/bin/y-sweet
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /entrypoint.sh
COPY tools/env.defaults.sh /usr/local/share/remdo/env.defaults.sh
COPY docker/entrypoint-env.sh /usr/local/share/remdo/entrypoint-env.sh
COPY --from=builder /app/remdo-api-server.cjs /app/remdo-api-server.cjs
COPY --from=builder /app/snapshot.mjs /app/snapshot.mjs
COPY --from=builder /app/backup.mjs /app/backup.mjs
COPY --from=builder /app/bootstrap-secrets.cjs /app/bootstrap-secrets.cjs

RUN chmod +x \
  /entrypoint.sh \
  /app/remdo-api-server.cjs \
  /app/snapshot.mjs \
  /app/backup.mjs \
  /app/bootstrap-secrets.cjs

CMD ["/entrypoint.sh"]
