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
  vite.shared.ts \
  index.html \
  ./

COPY src ./src
COPY lib ./lib
COPY config ./config
COPY public ./public
COPY tools ./tools

RUN pnpm install --frozen-lockfile --prod \
  && NODE_ENV=production ./tools/env.sh pnpm run build

# Bundle snapshot tool for runtime backups (no pnpm dependency in runner).
RUN mkdir -p /usr/local/bin \
  && SNAPSHOT_BANNER=$(printf '%s\n%s' \
    '#!/usr/bin/env node' \
    'import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);') \
  && pnpm dlx esbuild tools/snapshot.ts \
    --platform=node \
    --format=esm \
    --bundle \
    --target=node22 \
    --tsconfig=tsconfig.json \
    --banner:js="$SNAPSHOT_BANNER" \
    --outfile=/usr/local/bin/snapshot.mjs

##################################
# Auth binary: fetch Tinyauth    #
##################################
FROM ghcr.io/steveiliop56/tinyauth:v4 AS tinyauth

############################
# Runner: serve SPA + YJS  #
############################
FROM node:24.12-alpine AS runner

# TODO: Add a test to ensure this pinned version stays aligned with package.json.
ENV YSWEET_VERSION=^0.9.1

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
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/entrypoint.sh /entrypoint.sh
COPY tools/env.defaults.sh /usr/local/share/remdo/env.defaults.sh
COPY --from=builder /usr/local/bin/snapshot.mjs /usr/local/bin/snapshot.mjs
COPY --from=tinyauth /tinyauth/tinyauth /usr/local/bin/tinyauth

RUN chmod +x /entrypoint.sh
RUN chmod +x /usr/local/bin/snapshot.mjs
RUN chmod +x /usr/local/bin/tinyauth

EXPOSE 8080

CMD ["/entrypoint.sh"]
